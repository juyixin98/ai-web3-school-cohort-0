import type { Address } from "viem";
import { GUARD_DEFAULTS } from "../config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TxRequest {
  to: Address;
  value: bigint;
  data: `0x${string}`;
  simulatedOutput?: bigint;  // expected output amount from eth_call
}

export interface GuardResult {
  passed: boolean;
  reason?: string;
  action: "auto" | "confirm" | "reject";
}

export interface GuardState {
  dailySpent: number;   // USDC
  txCount: number;
  lastTxAt: number;     // timestamp
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let state: GuardState = {
  dailySpent: 0,
  txCount: 0,
  lastTxAt: 0,
};

const MIN_TX_INTERVAL_MS = 5_000; // 5 seconds between auto tx

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function isWhitelisted(to: Address): boolean {
  return GUARD_DEFAULTS.whitelistedRouters.some(
    (r) => r.toLowerCase() === to.toLowerCase(),
  );
}

function isWithinDailyBudget(amount: number): boolean {
  return state.dailySpent + amount <= GUARD_DEFAULTS.maxDaily;
}

function isWithinSingleCap(amount: number): boolean {
  return amount <= GUARD_DEFAULTS.maxPerTx;
}

function isWithinRateLimit(now: number): boolean {
  return now - state.lastTxAt >= MIN_TX_INTERVAL_MS;
}

// ---------------------------------------------------------------------------
// Main guard check
// ---------------------------------------------------------------------------

export function checkTx(
  request: TxRequest,
  amountUsd: number,
  expectedSlippagePct: number = 0,
): GuardResult {
  const now = Date.now();

  // 1: whitelist
  if (!isWhitelisted(request.to)) {
    return { passed: false, reason: "目标地址不在白名单", action: "reject" };
  }

  // 2: single cap
  if (!isWithinSingleCap(amountUsd)) {
    return { passed: false, reason: `单笔金额 $${amountUsd} 超出上限 $${GUARD_DEFAULTS.maxPerTx}`, action: "reject" };
  }

  // 3: daily budget
  if (!isWithinDailyBudget(amountUsd)) {
    return {
      passed: false,
      reason: `日预算不足: 已用 $${state.dailySpent} + 本次 $${amountUsd} > 上限 $${GUARD_DEFAULTS.maxDaily}`,
      action: "reject",
    };
  }

  // 4: slippage
  if (expectedSlippagePct > GUARD_DEFAULTS.maxSlippage) {
    return {
      passed: false,
      reason: `滑点 ${expectedSlippagePct.toFixed(2)}% 超出上限 ${GUARD_DEFAULTS.maxSlippage}%`,
      action: "reject",
    };
  }

  // 5: rate limit
  if (!isWithinRateLimit(now)) {
    return { passed: false, reason: "请求过于频繁，请稍后再试", action: "reject" };
  }

  // 6: determine action level
  let action: "auto" | "confirm" | "reject" = "confirm";
  if (amountUsd <= GUARD_DEFAULTS.autoApprove) {
    action = "auto";
  } else if (amountUsd > GUARD_DEFAULTS.maxPerTx) {
    action = "reject";
  }

  return { passed: true, action };
}

// ---------------------------------------------------------------------------
// Record a completed transaction
// ---------------------------------------------------------------------------

export function recordTx(amountUsd: number): void {
  state.dailySpent += amountUsd;
  state.txCount += 1;
  state.lastTxAt = Date.now();
}

// ---------------------------------------------------------------------------
// Reset daily state
// ---------------------------------------------------------------------------

export function resetDaily(): void {
  state = { dailySpent: 0, txCount: 0, lastTxAt: 0 };
}

export function getState(): GuardState {
  return { ...state };
}
