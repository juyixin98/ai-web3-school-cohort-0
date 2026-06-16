export interface RiskAssessment {
  level: "low" | "medium" | "high";
  factors: string[];
}

export interface ScoredOpportunity {
  id: string;
  category: "dex" | "lending" | "staking" | "bridge";
  title: string;
  description: string;
  expectedReturn: number;    // % APR or spread %
  confidence: number;         // 0-1
  risk: RiskAssessment;
  action: string;             // suggested action for user
  raw: unknown;               // original scanner data
}

export interface MarketSnapshot {
  timestamp: number;
  dexOpportunities: number;
  lendingProtocols: string[];
  bestStaking: { provider: string; apr: number } | null;
  topOpportunities: ScoredOpportunity[];
  summary: string;           // one-paragraph summary for AI
}

export interface AgentContext {
  snapshot: MarketSnapshot;
  userQuestion?: string;
  userBalance?: Record<string, number>;
}
