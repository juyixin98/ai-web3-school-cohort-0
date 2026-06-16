import {
  createPublicClient,
  http,
  getContract,
  parseAbi,
  formatUnits,
} from "viem";
import { DATA_NETWORK, RPC_URLS, STAKING } from "../config.js";

// ---------------------------------------------------------------------------
// Lido stETH — totals
// ---------------------------------------------------------------------------

const stETHAbi = parseAbi([
  "function totalPooledEther() view returns (uint256)",
  "function totalShares() view returns (uint256)",
]);

// ---------------------------------------------------------------------------
// Rocket Pool rETH
// ---------------------------------------------------------------------------

const rETHAbi = parseAbi([
  "function getExchangeRate() view returns (uint256)",
]);

// ---------------------------------------------------------------------------
// Frax sfrxETH (another liquid staking token for comparison)
// ---------------------------------------------------------------------------

const sfrxETH_ABI = parseAbi([
  "function pricePerShare() view returns (uint256)",
]);

const FRAX = {
  sfrxETH: "0xac3E018457B222d93114458476f3E3416Abbe38F" as const,
};

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

function getClient() {
  return createPublicClient({
    chain: DATA_NETWORK,
    transport: http(RPC_URLS[DATA_NETWORK.id]),
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("🔍 DeFi Scout — Staking Scanner\n");
  console.log(`Network: ${DATA_NETWORK.name} (${DATA_NETWORK.id})\n`);

  const client = getClient();
  const providers: { name: string; rate: number }[] = [];

  // Lido stETH
  try {
    const steth = getContract({
      address: STAKING.mainnet.stETH,
      abi: stETHAbi,
      client,
    });
    const pooled = await steth.read.totalPooledEther();
    const shares = await steth.read.totalShares();
    const rate = Number(formatUnits(pooled, 18)) / Number(formatUnits(shares, 18));
    providers.push({ name: "Lido stETH", rate });
    console.log(`  Lido stETH:      1 stETH = ${rate.toFixed(6)} ETH`);
    console.log(`    隐含 APR: ${((rate - 1) * 100).toFixed(2)}%`);
  } catch (e: any) {
    console.log(`  Lido stETH: ⚠️ ${e.shortMessage || e.message}`);
  }

  // Rocket Pool rETH
  try {
    const reth = getContract({
      address: STAKING.mainnet.rETH,
      abi: rETHAbi,
      client,
    });
    const rate = await reth.read.getExchangeRate();
    const rateNum = Number(formatUnits(rate, 18));
    providers.push({ name: "Rocket Pool rETH", rate: rateNum });
    console.log(`  Rocket Pool rETH: 1 rETH = ${rateNum.toFixed(6)} ETH`);
    console.log(`    隐含 APR: ${((rateNum - 1) * 100).toFixed(2)}%`);
  } catch (e: any) {
    console.log(`  Rocket Pool rETH: ⚠️ ${e.shortMessage || e.message}`);
  }

  // Frax sfrxETH
  try {
    const sfrx = getContract({
      address: FRAX.sfrxETH,
      abi: sfrxETH_ABI,
      client,
    });
    const pps = await sfrx.read.pricePerShare();
    const rateNum = Number(formatUnits(pps, 18));
    providers.push({ name: "Frax sfrxETH", rate: rateNum });
    console.log(`  Frax sfrxETH:     1 sfrxETH = ${rateNum.toFixed(6)} ETH`);
    console.log(`    隐含 APR: ${((rateNum - 1) * 100).toFixed(2)}%`);
  } catch (e: any) {
    console.log(`  Frax sfrxETH: ⚠️ ${e.shortMessage || e.message}`);
  }

  // Best yield
  if (providers.length > 1) {
    providers.sort((a, b) => b.rate - a.rate);
    console.log("\n═══ 最优质押收益 ═══\n");
    for (const p of providers) {
      const mark = p === providers[0] ? "👑" : "  ";
      console.log(`  ${mark} ${p.name}: ${p.rate.toFixed(6)} (APR ~${((p.rate - 1) * 100).toFixed(2)}%)`);
    }
  }

  console.log("\n📝 质押收益 = 底层 ETH PoS 质押收益 + 各 token 供需溢价");
}

main().catch(console.error);
