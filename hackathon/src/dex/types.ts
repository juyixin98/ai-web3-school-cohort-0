import type { Address } from "viem";

export interface TokenPair {
  tokenA: Address;
  tokenB: Address;
  symbolA: string;
  symbolB: string;
  decimalsA: number;
  decimalsB: number;
}

export interface DexQuote {
  dex: string;
  pairAddress: Address;
  inputAmount: bigint;
  outputAmount: bigint;
  priceInA: number;    // 1 A = ? B
  priceInB: number;    // 1 B = ? A
  reserveA: bigint;
  reserveB: bigint;
  fee: number;         // 0.003 = 0.3% for V2
}

export interface ArbitrageOpportunity {
  pair: TokenPair;
  buyAt: { dex: string; price: number };
  sellAt: { dex: string; price: number };
  spreadPct: number;
  estimatedProfit: number;   // after gas
  estimatedGas: number;      // in USDC
  isViable: boolean;         // profitable after costs
  riskLevel: "low" | "medium" | "high";
}
