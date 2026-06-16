// DeFi Scout — Unified Scanner + Analyzer

import { createPublicClient, http, parseAbi, getContract, formatUnits } from "viem";
import { DATA_NETWORK, RPC_URLS, STAKING, TOKENS } from "./config.js";
import { scanPair, findArbitrage } from "./dex/scanner.js";
import { scanAave, scanCompound, type LendingRate } from "./lending/scanner.js";
import { analyzeDex, analyzeLending, analyzeStaking, buildSnapshot, buildAgentContext } from "./agent/analyzer.js";
import { buildAnalysisPrompt, buildChatMessages, QUICK_QUESTIONS } from "./agent/prompts.js";
import type { TokenPair, ArbitrageOpportunity } from "./dex/types.js";

const COMPOUND_V3 = {
  cUSDCv3: "0xc3d688B66703497DAA19211EEdff47f25384cdc3" as const,
  cWETHv3: "0xA17581A9E3356d9A858b789D68B4d866e593aE94" as const,
};

// ---------------------------------------------------------------------------
// Staking scanner (inline — avoids duplicate file issues)
// ---------------------------------------------------------------------------

async function scanStaking(client: ReturnType<typeof createPublicClient>) {
  const providers: { name: string; apr: number }[] = [];

  // Rocket Pool rETH
  try {
    const reth = getContract({
      address: STAKING.mainnet.rETH,
      abi: parseAbi(["function getExchangeRate() view returns (uint256)"]),
      client,
    });
    const rate = await reth.read.getExchangeRate();
    const rateNum = Number(formatUnits(rate, 18));
    const apr = (rateNum - 1) * 100;
    providers.push({ name: "Rocket Pool rETH", apr });
  } catch {}

  // Frax sfrxETH
  try {
    const sfrx = getContract({
      address: "0xac3E018457B222d93114458476f3E3416Abbe38F",
      abi: parseAbi(["function pricePerShare() view returns (uint256)"]),
      client,
    });
    const pps = await sfrx.read.pricePerShare();
    const rateNum = Number(formatUnits(pps, 18));
    const apr = (rateNum - 1) * 100;
    providers.push({ name: "Frax sfrxETH", apr });
  } catch {}

  return providers;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("🦅 DeFi Scout — Full Scan\n");
  console.log(`Network: ${DATA_NETWORK.name} (${DATA_NETWORK.id})\n`);
  console.log("Scanning DEX / Lending / Staking...\n");

  const client = createPublicClient({
    chain: DATA_NETWORK,
    transport: http(RPC_URLS[DATA_NETWORK.id]),
  });

  // --- DEX ---
  const dexPairs: TokenPair[] = [
    { tokenA: TOKENS.mainnet.WETH, tokenB: TOKENS.mainnet.USDC, symbolA: "WETH", symbolB: "USDC", decimalsA: 18, decimalsB: 6 },
    { tokenA: TOKENS.mainnet.WETH, tokenB: TOKENS.mainnet.DAI, symbolA: "WETH", symbolB: "DAI", decimalsA: 18, decimalsB: 18 },
  ];

  const allDexOpps: ArbitrageOpportunity[] = [];
  for (const pair of dexPairs) {
    const quotes = await scanPair(client, pair);
    const arb = findArbitrage(pair, quotes);
    if (arb) allDexOpps.push(arb);
  }

  // --- Lending ---
  const aaveTokens = [
    { symbol: "USDC", address: TOKENS.mainnet.USDC },
    { symbol: "DAI", address: TOKENS.mainnet.DAI },
    { symbol: "WETH", address: TOKENS.mainnet.WETH },
  ];

  const lendingRates: LendingRate[] = [];
  for (const t of aaveTokens) {
    try {
      const r = await scanAave(client, t.symbol, t.address);
      lendingRates.push(r);
    } catch {}
  }
  // Compound (may fail silently)
  for (const [symbol, cToken] of Object.entries({ USDC: COMPOUND_V3.cUSDCv3, WETH: COMPOUND_V3.cWETHv3 })) {
    try {
      const r = await scanCompound(client, symbol, cToken);
      lendingRates.push(r);
    } catch {}
  }

  // --- Staking ---
  const stakingProviders = await scanStaking(client);

  // --- Analyze ---
  const snapshot = buildSnapshot(allDexOpps, lendingRates, stakingProviders);

  console.log("═══════════════════════════════════════");
  console.log("📊 DeFi Scout — 市场快照\n");
  console.log(snapshot.summary);
  console.log("");

  if (snapshot.topOpportunities.length > 0) {
    console.log("═══ TOP 机会 ═══\n");
    for (const o of snapshot.topOpportunities) {
      const e = o.risk.level === "low" ? "🟢" : o.risk.level === "medium" ? "🟡" : "🔴";
      console.log(`  ${e} ${o.title}`);
      console.log(`    ${o.description}`);
      console.log(`    风险: ${o.risk.factors.join(", ")}`);
      console.log(`    建议: ${o.action}`);
      console.log();
    }
  }

  // --- Demo: build AI context ---
  const ctx = buildAgentContext(snapshot);
  const chatMsgs = buildChatMessages(ctx);
  console.log("═══ AI 对话上下文 (示例) ═══\n");
  console.log("System:", chatMsgs[0].content.slice(0, 200), "...\n");
  console.log("Context to send:\n");
  console.log(chatMsgs[2].content);

  console.log("\n═══ 快捷提问 ═══\n");
  for (const q of QUICK_QUESTIONS) {
    console.log(`  • ${q}`);
  }

  return { snapshot, chatMsgs };
}

main().catch(console.error);

export { main };
