import {
  createPublicClient,
  http,
  type PublicClient,
  parseAbi,
  getContract,
} from "viem";
import { sepolia } from "viem/chains";
import { RPC_URLS, AAVE_V3, TOKENS } from "../config.js";
import type { LendingRate, LendingOpportunity } from "./types.js";

// ---------------------------------------------------------------------------
// Aave V3 Pool ABI (minimal — reserve data)
// ---------------------------------------------------------------------------

const poolAbi = parseAbi([
  "function getReserveData(address asset) view returns (uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint8 decimals)",
]);

function getClient(): PublicClient {
  return createPublicClient({
    chain: sepolia,
    transport: http(RPC_URLS[sepolia.id]),
  });
}

// ---------------------------------------------------------------------------
// Convert ray (1e27) to APR %
// RAY = 1e27, APR = rate/RAY * 100 * seconds_per_year
// ---------------------------------------------------------------------------

function rayToAPR(rate: bigint): number {
  const SECONDS_PER_YEAR = 31536000n;
  const RAY = 10n ** 27n;
  const apr = Number((rate * SECONDS_PER_YEAR * 100n) / RAY) / 100; // already in %
  return Math.round(apr * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Scan Aave V3
// ---------------------------------------------------------------------------

async function scanAave(
  client: PublicClient,
  tokenSymbol: string,
  tokenAddress: `0x${string}`,
): Promise<LendingRate> {
  const pool = getContract({
    address: AAVE_V3.sepolia.pool,
    abi: poolAbi,
    client,
  });

  const reserve = await pool.read.getReserveData([tokenAddress]);

  return {
    protocol: "Aave V3",
    token: tokenSymbol,
    tokenAddress,
    supplyAPR: rayToAPR(reserve[2]),
    borrowAPR: rayToAPR(reserve[4]),
    totalSupplied: 0,  // needs UI data provider for real values
    totalBorrowed: 0,
    utilization: 0,
  };
}

// ---------------------------------------------------------------------------
// Main scan
// ---------------------------------------------------------------------------

async function main() {
  console.log("🔍 DeFi Scout — Lending Scanner\n");
  console.log(`Network: Sepolia (${sepolia.id})\n`);

  const client = getClient();
  const rates: LendingRate[] = [];

  const tokens = [
    { symbol: "USDC", address: TOKENS.sepolia.USDC },
    { symbol: "DAI", address: TOKENS.sepolia.DAI },
    { symbol: "WETH", address: TOKENS.sepolia.WETH },
  ];

  for (const t of tokens) {
    try {
      const rate = await scanAave(client, t.symbol, t.address);
      rates.push(rate);
      console.log(`  ${rate.protocol} ${rate.token}:`);
      console.log(`    Supply APR: ${rate.supplyAPR}%  |  Borrow APR: ${rate.borrowAPR}%`);
    } catch (e: any) {
      console.log(`  ${t.symbol}: ⚠️ ${e.shortMessage || e.message}`);
    }
  }

  // Look for supply/borrow spreads
  console.log("\n═══ 套利分析 ═══\n");
  for (const r of rates) {
    if (r.supplyAPR > r.borrowAPR) {
      console.log(`  ❌ ${r.token}: supply ${r.supplyAPR}% > borrow ${r.borrowAPR}% — 无套利`);
    } else {
      console.log(`  📊 ${r.token}: borrow @ ${r.borrowAPR}% → supply @ ${r.supplyAPR}% — 待检查跨协议`);
    }
  }

  return rates;
}

main().catch(console.error);

export { scanAave, type LendingRate };
