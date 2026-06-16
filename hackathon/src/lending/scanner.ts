import {
  createPublicClient,
  http,
  type PublicClient,
  parseAbi,
  getContract,
} from "viem";
import { DATA_NETWORK, RPC_URLS, AAVE_V3, TOKENS } from "../config.js";
import type { LendingRate } from "./types.js";

// ---------------------------------------------------------------------------
// Aave V3 Pool — getReserveData
// ---------------------------------------------------------------------------

const aavePoolAbi = parseAbi([
  "function getReserveData(address asset) view returns (uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint8 decimals)",
]);

// ---------------------------------------------------------------------------
// Compound V3 — getAssetInfoByAddress (supply side) + borrow rate
// ---------------------------------------------------------------------------

const compoundAbi = parseAbi([
  // cUSDCv3 / cWETHv3 on mainnet
  "function supplyRate() view returns (uint256)",
  "function borrowRate() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function totalBorrows() view returns (uint256)",
  "function baseToken() view returns (address)",
]);

// Compound V3 mainnet deployments
const COMPOUND_V3 = {
  mainnet: {
    cUSDCv3: "0xc3d688B66703497DAA19211EEdff47f25384cdc3" as const,
    cWETHv3: "0xA17581A9E3356d9A858b789D68B4d866e593aE94" as const,
  },
} as const;

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
// Convert ray (1e27) to APR %
// ---------------------------------------------------------------------------

function rayToAPR(rate: bigint): number {
  const SECONDS_PER_YEAR = 31536000n;
  const RAY = 10n ** 27n;
  const apr = Number((rate * SECONDS_PER_YEAR * 100n) / RAY) / 100;
  return Math.round(apr * 1000) / 1000;
}

// Compound rate is per-second, scaled by 1e18
function compoundToAPR(rate: bigint): number {
  const SECONDS_PER_YEAR = 31536000n;
  const apr = Number((rate * SECONDS_PER_YEAR * 100n) / 10n ** 18n) / 100;
  return Math.round(apr * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Scan Aave V3
// ---------------------------------------------------------------------------

async function scanAave(
  client: PublicClient,
  symbol: string,
  address: `0x${string}`,
): Promise<LendingRate> {
  const pool = getContract({
    address: AAVE_V3.mainnet.pool,
    abi: aavePoolAbi,
    client,
  });

  const reserve = await pool.read.getReserveData([address]);

  return {
    protocol: "Aave V3",
    token: symbol,
    tokenAddress: address,
    supplyAPR: rayToAPR(reserve[2]),
    borrowAPR: rayToAPR(reserve[4]),
    totalSupplied: 0,
    totalBorrowed: 0,
    utilization: 0,
  };
}

// ---------------------------------------------------------------------------
// Scan Compound V3
// ---------------------------------------------------------------------------

async function scanCompound(
  client: PublicClient,
  symbol: string,
  cToken: `0x${string}`,
): Promise<LendingRate> {
  const facade = getContract({
    address: cToken,
    abi: compoundAbi,
    client,
  });

  const [supply, borrow] = await Promise.all([
    facade.read.supplyRate(),
    facade.read.borrowRate(),
  ]);

  return {
    protocol: "Compound V3",
    token: symbol,
    tokenAddress: cToken,
    supplyAPR: compoundToAPR(supply),
    borrowAPR: compoundToAPR(borrow),
    totalSupplied: 0,
    totalBorrowed: 0,
    utilization: 0,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("🔍 DeFi Scout — Lending Scanner\n");
  console.log(`Network: ${DATA_NETWORK.name} (${DATA_NETWORK.id})\n`);

  const client = getClient();

  // Aave V3
  console.log("── Aave V3 ──");
  const aaveTokens = [
    { symbol: "USDC", address: TOKENS.mainnet.USDC },
    { symbol: "DAI", address: TOKENS.mainnet.DAI },
    { symbol: "WETH", address: TOKENS.mainnet.WETH },
  ];
  const aaveRates: LendingRate[] = [];
  for (const t of aaveTokens) {
    try {
      const r = await scanAave(client, t.symbol, t.address);
      aaveRates.push(r);
      console.log(`  ${r.token}: Supply ${r.supplyAPR}% / Borrow ${r.borrowAPR}%`);
    } catch (e: any) {
      console.log(`  ${t.symbol}: ⚠️ ${e.shortMessage || e.message}`);
    }
  }

  // Compound V3
  console.log("\n── Compound V3 ──");
  const compoundRates: LendingRate[] = [];
  const compoundTokens = [
    { symbol: "USDC", cToken: COMPOUND_V3.mainnet.cUSDCv3 },
    { symbol: "WETH", cToken: COMPOUND_V3.mainnet.cWETHv3 },
  ];
  for (const t of compoundTokens) {
    try {
      const r = await scanCompound(client, t.symbol, t.cToken);
      compoundRates.push(r);
      console.log(`  ${r.token}: Supply ${r.supplyAPR}% / Borrow ${r.borrowAPR}%`);
    } catch (e: any) {
      console.log(`  ${t.symbol}: ⚠️ ${e.shortMessage || e.message}`);
    }
  }

  // Cross-protocol comparison
  console.log("\n═══ 跨协议利差对比 ═══\n");
  const allByToken = new Map<string, LendingRate[]>();
  for (const r of [...aaveRates, ...compoundRates]) {
    const arr = allByToken.get(r.token) || [];
    arr.push(r);
    allByToken.set(r.token, arr);
  }

  for (const [token, rates] of allByToken) {
    if (rates.length < 2) continue;
    console.log(`  ${token}:`);
    const bestSupply = rates.reduce((a, b) => (a.supplyAPR > b.supplyAPR ? a : b));
    const bestBorrow = rates.reduce((a, b) => (a.borrowAPR < b.borrowAPR ? a : b));
    console.log(`    最优存款: ${bestSupply.protocol} @ ${bestSupply.supplyAPR}%`);
    console.log(`    最优借款: ${bestBorrow.protocol} @ ${bestBorrow.borrowAPR}%`);
    const spread = bestSupply.supplyAPR - bestBorrow.borrowAPR;
    console.log(`    利差: ${spread >= 0 ? "❌" : "📊"} ${spread.toFixed(3)}% ${spread >= 0 ? "(无套利)" : "(存贷套利空间)"}`);
  }
}

main().catch(console.error);

export { scanAave, scanCompound, type LendingRate };
