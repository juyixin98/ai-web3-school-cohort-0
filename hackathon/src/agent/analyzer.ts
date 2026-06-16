import type { ArbitrageOpportunity } from "../dex/types.js";
import type { LendingRate } from "../lending/types.js";
import type {
  ScoredOpportunity,
  MarketSnapshot,
  AgentContext,
  RiskAssessment,
} from "./types.js";

// ---------------------------------------------------------------------------
// Risk scoring
// ---------------------------------------------------------------------------

function assessDexRisk(opp: ArbitrageOpportunity): RiskAssessment {
  const factors: string[] = [];
  if (opp.spreadPct < 0.5) factors.push("价差极小");
  if (opp.spreadPct > 3) factors.push("高价差可能伴随低流动性");
  if (!opp.isViable) factors.push("扣除 gas 后无利润");
  return {
    level: opp.riskLevel,
    factors: factors.length ? factors : ["正常价差范围"],
  };
}

function assessLendingRisk(rate: LendingRate): RiskAssessment {
  const factors: string[] = [];
  if (rate.supplyAPR > 20) factors.push("供应利率异常高，可能存在额外风险");
  if (rate.borrowAPR > 30) factors.push("借款利率极高");
  if (rate.utilization > 90) factors.push("资金池利用率 > 90%，提款可能延迟");
  return {
    level: rate.supplyAPR > 20 || rate.borrowAPR > 30 ? "medium" : "low",
    factors: factors.length ? factors : ["主流借贷协议，风险较低"],
  };
}

// ---------------------------------------------------------------------------
// Score and rank
// ---------------------------------------------------------------------------

export function analyzeDex(
  opportunities: ArbitrageOpportunity[],
): ScoredOpportunity[] {
  return opportunities
    .filter((o) => o.spreadPct > 0)
    .map((o) => ({
      id: `dex-${o.pair.symbolA}-${o.pair.symbolB}`,
      category: "dex" as const,
      title: `${o.pair.symbolA}/${o.pair.symbolB} DEX 价差`,
      description: `${o.buyAt.dex}→${o.sellAt.dex} 价差 ${o.spreadPct}%，预估利润 $${o.estimatedProfit}`,
      expectedReturn: o.spreadPct,
      confidence: o.isViable ? 0.7 : 0.3,
      risk: assessDexRisk(o),
      action: o.isViable
        ? `在 ${o.buyAt.dex} 买入，在 ${o.sellAt.dex} 卖出`
        : "价差不足以覆盖 gas，不建议操作",
      raw: o,
    }))
    .sort((a, b) => b.expectedReturn - a.expectedReturn);
}

export function analyzeLending(
  rates: LendingRate[],
): ScoredOpportunity[] {
  const results: ScoredOpportunity[] = [];

  // Best supply options
  const supplyRates = [...rates].sort((a, b) => b.supplyAPR - a.supplyAPR);
  for (const r of supplyRates.slice(0, 3)) {
    results.push({
      id: `lend-supply-${r.token}-${r.protocol}`,
      category: "lending",
      title: `${r.token} 存款 — ${r.protocol}`,
      description: `存入 ${r.token} 获得 ${r.supplyAPR}% 年化`,
      expectedReturn: r.supplyAPR,
      confidence: 0.9,
      risk: assessLendingRisk(r),
      action: `在 ${r.protocol} 存入 ${r.token}`,
      raw: r,
    });
  }

  // Borrow arbitrage: supply at high rate protocol, borrow at low rate
  for (const r of rates) {
    const betterSupply = rates.find(
      (s) => s.token === r.token && s.supplyAPR > r.borrowAPR,
    );
    if (betterSupply) {
      const spread = betterSupply.supplyAPR - r.borrowAPR;
      results.push({
        id: `lend-arb-${r.token}`,
        category: "lending",
        title: `${r.token} 存贷套利`,
        description: `在 ${r.protocol} 借款 @ ${r.borrowAPR}% → 在 ${betterSupply.protocol} 存款 @ ${betterSupply.supplyAPR}%`,
        expectedReturn: spread,
        confidence: 0.6,
        risk: {
          level: spread > 5 ? "medium" : "low",
          factors: ["利率可能变化", "需同时管理借入和存入头寸"],
        },
        action: `杠杆套利：借 ${r.token} @ ${r.borrowAPR}%，存 @ ${betterSupply.supplyAPR}%`,
        raw: { borrow: r, supply: betterSupply },
      });
    }
  }

  return results.sort((a, b) => b.expectedReturn - a.expectedReturn);
}

export function analyzeStaking(
  providers: { name: string; apr: number }[],
): ScoredOpportunity[] {
  return providers
    .map((p) => ({
      id: `stake-${p.name}`,
      category: "staking" as const,
      title: `${p.name} 质押`,
      description: `质押 ETH 获得 ${p.apr.toFixed(2)}% 年化`,
      expectedReturn: p.apr,
      confidence: 0.85,
      risk: {
        level: "low" as const,
        factors: [
          "底层为 ETH PoS 质押",
          "LST 存在流动性风险但通常很小",
          "智能合约风险已审计",
        ],
      },
      action: `在 ${p.name} 质押 ETH`,
      raw: p,
    }))
    .sort((a, b) => b.expectedReturn - a.expectedReturn);
}

// ---------------------------------------------------------------------------
// Build market snapshot
// ---------------------------------------------------------------------------

export function buildSnapshot(
  dexOpps: ArbitrageOpportunity[],
  lendingRates: LendingRate[],
  stakingProviders: { name: string; apr: number }[],
): MarketSnapshot {
  const dexScored = analyzeDex(dexOpps);
  const lendScored = analyzeLending(lendingRates);
  const stakeScored = analyzeStaking(stakingProviders);

  const all = [...dexScored, ...lendScored, ...stakeScored].sort(
    (a, b) => b.expectedReturn - a.expectedReturn,
  );

  const bestStaking =
    stakingProviders.length > 0
      ? stakingProviders.reduce((a, b) => (a.apr > b.apr ? a : b))
      : null;

  const summary = generateSummary(all, bestStaking, lendingRates);

  return {
    timestamp: Date.now(),
    dexOpportunities: dexOpps.filter((o) => o.isViable).length,
    lendingProtocols: [...new Set(lendingRates.map((r) => r.protocol))],
    bestStaking: bestStaking
      ? { provider: bestStaking.name, apr: bestStaking.apr }
      : null,
    topOpportunities: all.slice(0, 5),
    summary,
  };
}

// ---------------------------------------------------------------------------
// Generate natural-language summary (for AI prompt context)
// ---------------------------------------------------------------------------

function generateSummary(
  scored: ScoredOpportunity[],
  bestStaking: { name: string; apr: number } | null,
  lendingRates: LendingRate[],
): string {
  const parts: string[] = ["## 当前 DeFi 市场快照\n"];

  // Staking
  if (bestStaking) {
    parts.push(
      `**最优质押**：${bestStaking.name} @ ${bestStaking.apr.toFixed(2)}% APR`,
    );
  }

  // Lending
  const supplyOptions = lendingRates
    .filter((r) => r.supplyAPR > 0)
    .sort((a, b) => b.supplyAPR - a.supplyAPR);
  if (supplyOptions.length > 0) {
    const top = supplyOptions[0];
    parts.push(
      `**最优存款**：${top.token} 在 ${top.protocol} @ ${top.supplyAPR}%`,
    );
  }

  // DEX
  const dexOpps = scored.filter((o) => o.category === "dex" && o.confidence > 0.5);
  if (dexOpps.length > 0) {
    parts.push(`**DEX 套利**：发现 ${dexOpps.length} 个可行机会`);
  } else {
    parts.push("**DEX 套利**：当前无可行机会（价差 < 交易成本）");
  }

  // Top pick
  if (scored.length > 0) {
    const top = scored[0];
    parts.push(`\n**综合最优**：[${top.category}] ${top.title} — 预期收益 ${top.expectedReturn.toFixed(2)}%`);
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Build AI conversation context
// ---------------------------------------------------------------------------

export function buildAgentContext(
  snapshot: MarketSnapshot,
  userQuestion?: string,
  userBalance?: Record<string, number>,
): AgentContext {
  return {
    snapshot,
    userQuestion,
    userBalance,
  };
}
