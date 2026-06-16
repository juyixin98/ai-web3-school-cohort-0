import {
  createPublicClient,
  http,
  type PublicClient,
  parseAbi,
  getContract,
  formatUnits,
} from "viem";
import { sepolia } from "viem/chains";
import { RPC_URLS, STAKING } from "../config.js";

// ---------------------------------------------------------------------------
// stETH: fetch totalPooledEther / totalShares to get exchange rate
// ---------------------------------------------------------------------------

const stETHAbi = parseAbi([
  "function totalPooledEther() view returns (uint256)",
  "function totalShares() view returns (uint256)",
]);

// ---------------------------------------------------------------------------
// rETH: getExchangeRate or getRethValue
// ---------------------------------------------------------------------------

const rETHAbi = parseAbi([
  "function getExchangeRate() view returns (uint256)",
  "function getRethValue(uint256 _ethAmount) view returns (uint256)",
]);

function getClient(): PublicClient {
  return createPublicClient({
    chain: sepolia,
    transport: http(RPC_URLS[sepolia.id]),
  });
}

async function main() {
  console.log("🔍 DeFi Scout — Staking Scanner\n");
  console.log(`Network: Sepolia (${sepolia.id})\n`);

  const client = getClient();

  // Lido stETH
  try {
    const steth = getContract({
      address: STAKING.sepolia.stETH,
      abi: stETHAbi,
      client,
    });
    const pooled = await steth.read.totalPooledEther();
    const shares = await steth.read.totalShares();
    const rate = Number(formatUnits(pooled, 18)) / Number(formatUnits(shares, 18));
    console.log(`  Lido stETH/ETH: ${rate.toFixed(4)}`);
    console.log(`    (1 stETH = ${rate.toFixed(4)} ETH, implied APR ~${((rate - 1) * 100).toFixed(2)}%)`);
  } catch (e: any) {
    console.log(`  Lido stETH: ⚠️ ${e.shortMessage || e.message}`);
  }

  // Rocket Pool rETH
  try {
    const reth = getContract({
      address: STAKING.sepolia.rETH,
      abi: rETHAbi,
      client,
    });
    const rate = await reth.read.getExchangeRate();
    const rateNum = Number(formatUnits(rate, 18));
    console.log(`  Rocket Pool rETH/ETH: ${rateNum.toFixed(4)}`);
    console.log(`    (1 rETH = ${rateNum.toFixed(4)} ETH, implied APR ~${((rateNum - 1) * 100).toFixed(2)}%)`);
  } catch (e: any) {
    console.log(`  Rocket Pool rETH: ⚠️ ${e.shortMessage || e.message}`);
  }

  console.log("\n📝 质押收益 = 底层 ETH 质押收益 + token 供需溢价");
}

main().catch(console.error);
