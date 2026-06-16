import {
  createPublicClient,
  http,
  type Address,
  type PublicClient,
  parseAbi,
  getContract,
  formatUnits,
  encodePacked,
  keccak256,
  getAddress,
} from "viem";
import { mainnet } from "viem/chains";
import {
  RPC_URLS,
  DATA_NETWORK,
  UNISWAP_V2,
  SUSHISWAP_V2,
  TOKENS,
} from "../config.js";
import type { DexQuote, TokenPair, ArbitrageOpportunity } from "./types.js";

// ---------------------------------------------------------------------------
// Pair ABI
// ---------------------------------------------------------------------------

const pairAbi = parseAbi([
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
]);

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

function getClient(): PublicClient {
  return createPublicClient({
    chain: DATA_NETWORK,
    transport: http(RPC_URLS[DATA_NETWORK.id]),
  });
}

// ---------------------------------------------------------------------------
// Compute V2 pair address (CREATE2)
// ---------------------------------------------------------------------------

function computeV2Pair(
  factory: Address,
  tokenA: Address,
  tokenB: Address,
  initCodeHash: `0x${string}`,
): Address {
  const [a, b] =
    tokenA.toLowerCase() < tokenB.toLowerCase()
      ? [tokenA, tokenB]
      : [tokenB, tokenA];
  const salt = keccak256(encodePacked(["address", "address"], [a, b]));
  const hash = keccak256(
    encodePacked(
      ["bytes1", "address", "bytes32", "bytes32"],
      ["0xff", factory, salt, initCodeHash],
    ),
  );
  return getAddress(`0x${hash.slice(26)}`);
}

// ---------------------------------------------------------------------------
// Fetch quote from a single V2 source
// ---------------------------------------------------------------------------

interface V2Source {
  name: string;
  factory: Address;
  initCodeHash: `0x${string}`;
  fee: number;
}

async function fetchV2Quote(
  client: PublicClient,
  source: V2Source,
  pair: TokenPair,
): Promise<DexQuote> {
  const { tokenA, tokenB, symbolA, symbolB, decimalsA, decimalsB } = pair;
  const pairAddr = computeV2Pair(
    source.factory,
    tokenA,
    tokenB,
    source.initCodeHash,
  );

  const pairContract = getContract({ address: pairAddr, abi: pairAbi, client });

  const [reserves, t0] = await Promise.all([
    pairContract.read.getReserves().catch(() => {
      throw new Error(`pair not found at ${pairAddr}`);
    }),
    pairContract.read.token0(),
  ]);

  const reserveA = getAddress(t0) === getAddress(tokenA) ? reserves[0] : reserves[1];
  const reserveB = getAddress(t0) === getAddress(tokenA) ? reserves[1] : reserves[0];

  if (reserveA === 0n || reserveB === 0n) {
    throw new Error(`empty pool: ${symbolA}-${symbolB}`);
  }

  const priceInA =
    Number(formatUnits(reserveB, decimalsB)) / Number(formatUnits(reserveA, decimalsA));
  const priceInB =
    Number(formatUnits(reserveA, decimalsA)) / Number(formatUnits(reserveB, decimalsB));

  return {
    dex: source.name,
    pairAddress: pairAddr,
    inputAmount: 10n ** BigInt(decimalsA),
    outputAmount: (reserveB * 10n ** BigInt(decimalsA)) / reserveA,
    priceInA,
    priceInB,
    reserveA,
    reserveB,
    fee: source.fee,
  };
}

// ---------------------------------------------------------------------------
// Scan all DEXs for a token pair
// ---------------------------------------------------------------------------

const V2_SOURCES: V2Source[] = [
  {
    name: "Uniswap V2",
    factory: UNISWAP_V2.mainnet.factory,
    initCodeHash: UNISWAP_V2.mainnet.pairCodeHash,
    fee: 0.003,
  },
  {
    name: "SushiSwap V2",
    factory: SUSHISWAP_V2.mainnet.factory,
    initCodeHash: SUSHISWAP_V2.mainnet.pairCodeHash,
    fee: 0.003,
  },
];

async function scanPair(
  client: PublicClient,
  pair: TokenPair,
): Promise<DexQuote[]> {
  const quotes: DexQuote[] = [];

  for (const src of V2_SOURCES) {
    try {
      const q = await fetchV2Quote(client, src, pair);
      quotes.push(q);
    } catch (e: any) {
      console.log(`  ${src.name}: ⚠️ ${e.shortMessage || e.message}`);
    }
  }

  return quotes;
}

// ---------------------------------------------------------------------------
// Find arbitrage opportunities
// ---------------------------------------------------------------------------

function findArbitrage(
  pair: TokenPair,
  quotes: DexQuote[],
): ArbitrageOpportunity | null {
  if (quotes.length < 2) return null;

  let bestBid: DexQuote | null = null;
  let bestAsk: DexQuote | null = null;

  for (const q of quotes) {
    if (!bestAsk || q.priceInA < bestAsk.priceInA) bestAsk = q;
    if (!bestBid || q.priceInA > bestBid.priceInA) bestBid = q;
  }

  if (!bestBid || !bestAsk || bestBid === bestAsk) return null;

  const spread = bestBid.priceInA - bestAsk.priceInA;
  const spreadPct = (spread / bestAsk.priceInA) * 100;

  const gasEst = 5; // USD, rough mainnet swap gas
  const tradeSize = 1000;
  const profit = tradeSize * (spreadPct / 100) - gasEst;

  return {
    pair,
    buyAt: { dex: bestAsk.dex, price: bestAsk.priceInA },
    sellAt: { dex: bestBid.dex, price: bestBid.priceInA },
    spreadPct: Math.round(spreadPct * 1000) / 1000,
    estimatedProfit: Math.round(profit * 100) / 100,
    estimatedGas: gasEst,
    isViable: profit > 0 && spreadPct > 0.3,
    riskLevel: spreadPct > 3 ? "high" : spreadPct > 1 ? "medium" : "low",
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const MONITORED_PAIRS: TokenPair[] = [
  {
    tokenA: TOKENS.mainnet.WETH,
    tokenB: TOKENS.mainnet.USDC,
    symbolA: "WETH",
    symbolB: "USDC",
    decimalsA: 18,
    decimalsB: 6,
  },
  {
    tokenA: TOKENS.mainnet.WETH,
    tokenB: TOKENS.mainnet.DAI,
    symbolA: "WETH",
    symbolB: "DAI",
    decimalsA: 18,
    decimalsB: 18,
  },
  {
    tokenA: TOKENS.mainnet.WBTC,
    tokenB: TOKENS.mainnet.USDC,
    symbolA: "WBTC",
    symbolB: "USDC",
    decimalsA: 8,
    decimalsB: 6,
  },
];

async function main() {
  console.log("🔍 DeFi Scout — DEX Scanner\n");
  console.log(`Network: ${DATA_NETWORK.name} (${DATA_NETWORK.id})`);
  console.log(
    `Monitored pairs: ${MONITORED_PAIRS.map((p) => `${p.symbolA}/${p.symbolB}`).join(", ")}`,
  );
  console.log(`DEXs: ${V2_SOURCES.map((s) => s.name).join(", ")}\n`);

  const client = getClient();
  const opportunities: ArbitrageOpportunity[] = [];

  for (const pair of MONITORED_PAIRS) {
    console.log(`── ${pair.symbolA}/${pair.symbolB} ──`);

    const quotes = await scanPair(client, pair);
    for (const q of quotes) {
      console.log(
        `  ${q.dex}: 1 ${pair.symbolA} = ${q.priceInA.toFixed(4)} ${pair.symbolB}  (fee ${q.fee * 100}%)`,
      );
    }

    const arb = findArbitrage(pair, quotes);
    if (arb) {
      opportunities.push(arb);
    } else if (quotes.length >= 2) {
      console.log("  → 无套利空间");
    }
    console.log();
  }

  // Summary
  if (opportunities.length > 0) {
    console.log("═══════════════════════════════════════");
    console.log("📊 套利机会汇总\n");
    for (const o of opportunities) {
      const emoji =
        o.riskLevel === "low" ? "🟢" : o.riskLevel === "medium" ? "🟡" : "🔴";
      console.log(`  ${emoji} ${o.pair.symbolA}/${o.pair.symbolB}`);
      console.log(`     买入: ${o.buyAt.dex} @ ${o.buyAt.price.toFixed(4)}`);
      console.log(`     卖出: ${o.sellAt.dex} @ ${o.sellAt.price.toFixed(4)}`);
      console.log(
        `     价差: ${o.spreadPct}%  |  预估利润: $${o.estimatedProfit}  |  风险: ${o.riskLevel}`,
      );
      console.log(`     可行: ${o.isViable ? "✅" : "❌ 扣除 gas 后无利润"}`);
      console.log();
    }
  } else {
    console.log("📊 当前无套利机会（所有价差 < 交易成本）");
  }

  return opportunities;
}

main().catch(console.error);

export { scanPair, findArbitrage, type ArbitrageOpportunity };
