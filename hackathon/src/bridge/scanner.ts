import {
  createPublicClient,
  http,
  type PublicClient,
  parseAbi,
  getContract,
  formatUnits,
  type Address,
  getAddress,
  encodePacked,
  keccak256,
} from "viem";
import { mainnet, arbitrum, optimism, base } from "viem/chains";
import { RPC_URLS, UNISWAP_V2, TOKENS } from "../config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChainPrice {
  chain: string;
  chainId: number;
  price: number;         // 1 tokenA = ? tokenB
  dex: string;
  blockNumber: bigint;
}

interface CrossChainSpread {
  pair: string;
  prices: ChainPrice[];
  maxSpreadPct: number;
  bestBuy: ChainPrice;
  bestSell: ChainPrice;
}

// ---------------------------------------------------------------------------
// Pair ABI for V2-style DEXes
// ---------------------------------------------------------------------------

const pairAbi = parseAbi([
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() external view returns (address)",
]);

// ---------------------------------------------------------------------------
// Compute V2 pair address
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
// Uniswap V2-style deployments per chain
// ---------------------------------------------------------------------------

const V2_INIT_HASH =
  "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f" as `0x${string}`;

const CHAIN_DEXES = [
  {
    chain: mainnet,
    rpc: RPC_URLS[mainnet.id],
    dex: "Uniswap V2",
    factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f" as Address,
    tokenA: TOKENS.mainnet.WETH,
    tokenB: TOKENS.mainnet.USDC,
    decimalsA: 18,
    decimalsB: 6,
  },
  {
    chain: arbitrum,
    rpc: RPC_URLS[arbitrum.id],
    dex: "Uniswap V2 (Arb)",
    // Arbitrum Uniswap V2 factory (diff deployment) — use Camelot or Sushi
    // SushiSwap V2 on Arbitrum:
    factory: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4" as Address,
    tokenA: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" as Address, // WETH Arbitrum
    tokenB: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as Address, // USDC Arbitrum
    decimalsA: 18,
    decimalsB: 6,
  },
  {
    chain: optimism,
    rpc: RPC_URLS[optimism.id],
    dex: "Velodrome (OP)",
    // Velodrome V2 on Optimism — use Uniswap V2 fork pattern
    factory: "0xF1046053aa5682b786F8a1ff5dB9515538e71299" as Address,
    tokenA: "0x4200000000000000000000000000000000000006" as Address, // WETH Optimism
    tokenB: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85" as Address, // USDC Optimism
    decimalsA: 18,
    decimalsB: 6,
  },
  {
    chain: base,
    rpc: RPC_URLS[base.id],
    dex: "Aerodrome (Base)",
    factory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da" as Address,
    tokenA: "0x4200000000000000000000000000000000000006" as Address, // WETH Base
    tokenB: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address, // USDC Base
    decimalsA: 18,
    decimalsB: 6,
  },
];

// ---------------------------------------------------------------------------
// Fetch price from one chain
// ---------------------------------------------------------------------------

async function fetchPrice(cfg: (typeof CHAIN_DEXES)[number]): Promise<ChainPrice | null> {
  const client = createPublicClient({
    chain: cfg.chain,
    transport: http(cfg.rpc),
  });

  try {
    const pairAddr = computeV2Pair(
      cfg.factory,
      cfg.tokenA,
      cfg.tokenB,
      V2_INIT_HASH,
    );

    const pair = getContract({ address: pairAddr, abi: pairAbi, client });
    const [reserves, t0] = await Promise.all([
      pair.read.getReserves(),
      pair.read.token0(),
    ]);

    const reserveA =
      getAddress(t0) === getAddress(cfg.tokenA) ? reserves[0] : reserves[1];
    const reserveB =
      getAddress(t0) === getAddress(cfg.tokenA) ? reserves[1] : reserves[0];

    const price =
      Number(formatUnits(reserveB, cfg.decimalsB)) /
      Number(formatUnits(reserveA, cfg.decimalsA));

    const block = await client.getBlockNumber();

    return {
      chain: cfg.chain.name,
      chainId: cfg.chain.id,
      price,
      dex: cfg.dex,
      blockNumber: block,
    };
  } catch (e: any) {
    console.log(`  ${cfg.chain.name}: ⚠️ ${e.shortMessage || e.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("🔍 DeFi Scout — Cross-Chain Bridge Scanner\n");
  console.log(`Pair: WETH/USDC across 4 chains\n`);

  const results = await Promise.all(CHAIN_DEXES.map(fetchPrice));
  const prices = results.filter((r): r is ChainPrice => r !== null);

  for (const p of prices) {
    console.log(`  ${p.chain} (${p.chainId})`);
    console.log(`    ${p.dex}: 1 WETH = ${p.price.toFixed(2)} USDC`);
    console.log(`    Block: ${p.blockNumber}`);
  }

  if (prices.length >= 2) {
    const sorted = [...prices].sort((a, b) => a.price - b.price);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const spread = ((max.price - min.price) / min.price) * 100;

    console.log("\n═══ 跨链价差 ═══\n");
    console.log(`  最低: ${min.chain} — 1 WETH = ${min.price.toFixed(2)} USDC`);
    console.log(`  最高: ${max.chain} — 1 WETH = ${max.price.toFixed(2)} USDC`);
    console.log(`  价差: ${spread.toFixed(3)}%`);

    if (spread > 1) {
      console.log(`\n  📊 跨链套利机会！在 ${min.chain} 买入，在 ${max.chain} 卖出`);
      console.log(`  ⚠️ 需扣除跨链桥费用 + 两笔 gas`);
    } else {
      console.log(`\n  → 价差不足 1%，扣除跨链桥费后无利润`);
    }
  }

  return prices;
}

main().catch(console.error);
