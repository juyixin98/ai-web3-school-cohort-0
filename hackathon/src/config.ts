import { type Address, sepolia, mainnet, arbitrum, optimism, base } from "viem/chains";

// ========================
// RPC
// ========================

export const RPC_URLS: Record<number, string> = {
  [mainnet.id]: process.env.RPC_ETHEREUM || "https://eth.drpc.org",
  [sepolia.id]: process.env.RPC_SEPOLIA || "https://rpc.sepolia.org",
  [arbitrum.id]: process.env.RPC_ARBITRUM || "https://arb1.arbitrum.io/rpc",
  [optimism.id]: process.env.RPC_OPTIMISM || "https://mainnet.optimism.io",
  [base.id]: process.env.RPC_BASE || "https://mainnet.base.org",
};

// ========================
// Token addresses
// ========================

export const TOKENS = {
  mainnet: {
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address,
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
    DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F" as Address,
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7" as Address,
    WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" as Address,
  },
  sepolia: {
    WETH: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" as Address,
    USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address,
    DAI: "0xFF34B3d4Aee8ddCd6F9AFFb6Fe49bD371bE8a714" as Address,
  },
} as const;

// ========================
// Uniswap V2
// ========================

const UNISWAP_V2_INIT_HASH =
  "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f" as `0x${string}`;

export const UNISWAP_V2 = {
  mainnet: {
    factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f" as Address,
    router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" as Address,
    pairCodeHash: UNISWAP_V2_INIT_HASH,
  },
  sepolia: {
    factory: "0x7E0987E5b3a30e3f2828572Bb659a548460a3003" as Address,
    router: "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008" as Address,
    pairCodeHash: UNISWAP_V2_INIT_HASH,
  },
} as const;

// ========================
// SushiSwap V2 (same factory pattern)
// ========================

const SUSHI_INIT_HASH =
  "0xe18a34eb0e04b04f7a0ac29a6e80748dca96319b42c54d679cb821dca90c6303" as `0x${string}`;

export const SUSHISWAP_V2 = {
  mainnet: {
    factory: "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac" as Address,
    router: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F" as Address,
    pairCodeHash: SUSHI_INIT_HASH,
  },
} as const;

// ========================
// Uniswap V3
// ========================

export const UNISWAP_V3 = {
  mainnet: {
    factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984" as Address,
    quoter: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6" as Address,
    swapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564" as Address,
  },
  sepolia: {
    factory: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c" as Address,
    quoter: "0xEd1f6473345F45C75C9590dd573632F2f7b9C47C" as Address,
    swapRouter: "0x3bFA4769FB09eEfC5a80d6E87c3B9C650f7Ae48E" as Address,
  },
} as const;

// ========================
// Aave V3
// ========================

export const AAVE_V3 = {
  mainnet: {
    pool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2" as Address,
  },
  sepolia: {
    pool: "0x6Ae43d3271fb68876A95773EA2B4837A89c824A2" as Address,
  },
} as const;

// ========================
// Lido / Rocket Pool
// ========================

export const STAKING = {
  mainnet: {
    stETH: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84" as Address,
    rETH: "0xae78736Cd615f374D3085123A210448E74Fc6393" as Address,
  },
  sepolia: {
    stETH: "0x3e3FE7dBc6B4C189E7128855dD526361c49b40Af" as Address,
    rETH: "0x32Feb28e0A0F2Cb0b4BC2AA2b6F44C5F4EeC8f9c" as Address,
  },
} as const;

// ========================
// Active network for data scanning vs execution
// ========================

export const DATA_NETWORK = mainnet;    // Read real data from mainnet (free)
export const EXEC_NETWORK = sepolia;    // Execute trades on testnet

// ========================
// Guard defaults
// ========================

export const GUARD_DEFAULTS = {
  maxPerTx: 100,
  maxDaily: 500,
  autoApprove: 10,
  maxSlippage: 1.0, // %
  whitelistedRouters: [
    UNISWAP_V2.mainnet.router,
    UNISWAP_V3.mainnet.swapRouter,
    SUSHISWAP_V2.mainnet.router,
  ] as Address[],
} as const;
