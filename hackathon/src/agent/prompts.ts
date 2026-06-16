import type { MarketSnapshot, AgentContext } from "./types.js";

// ============================================================================
// System Prompt
// ============================================================================

export const SYSTEM_PROMPT = `你是一个 DeFi Scout AI 分析助手。
你的职责是帮助用户理解当前的 DeFi 市场机会，给出清晰、可操作的建议。

## 核心原则
1. **区分事实和推断**：明确标注哪些是链上数据，哪些是你的分析判断
2. **标注风险**：每个机会必须附风险等级（低/中/高）和风险因素
3. **不替用户做决定**：给出建议和理由，但最终确认由用户完成
4. **小额优先**：对于未经验证的策略，建议先用小额测试
5. **安全第一**：不推荐未审计协议，不推荐无限授权

## 回答格式
- 机会描述 → 具体数字 → 风险 → 建议操作
- 有多个机会时按预期收益排序
- 不确定时明确说"我不确定，建议进一步验证"
`;

// ============================================================================
// Build user-facing analysis prompt
// ============================================================================

export function buildAnalysisPrompt(ctx: AgentContext): string {
  const { snapshot, userQuestion, userBalance } = ctx;
  const lines: string[] = [];

  lines.push(snapshot.summary);
  lines.push("");

  if (snapshot.topOpportunities.length > 0) {
    lines.push("## TOP 机会");
    for (const o of snapshot.topOpportunities) {
      const riskEmoji =
        o.risk.level === "low" ? "🟢" : o.risk.level === "medium" ? "🟡" : "🔴";
      lines.push(
        `- ${riskEmoji} [${o.category}] ${o.title}: ${o.description} | 信心: ${(o.confidence * 100).toFixed(0)}%`,
      );
    }
  }

  if (userBalance) {
    lines.push("\n## 用户持仓");
    for (const [token, amount] of Object.entries(userBalance)) {
      lines.push(`- ${token}: ${amount}`);
    }
  }

  if (userQuestion) {
    lines.push(`\n## 用户问题\n${userQuestion}`);
  }

  return lines.join("\n");
}

// ============================================================================
// Conversation templates
// ============================================================================

export const QUICK_QUESTIONS = [
  "现在最值得做的 DeFi 操作是什么？",
  "我的 USDC 应该存哪里？",
  "DEX 上有套利机会吗？",
  "质押哪个 LST 收益最高？",
  "借贷市场有什么机会？",
];

// ============================================================================
// Build a one-shot analysis prompt for Claude/OpenAI API
// ============================================================================

export function buildChatMessages(
  ctx: AgentContext,
): Array<{ role: "system" | "user"; content: string }> {
  const analysis = buildAnalysisPrompt(ctx);

  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content:
        ctx.userQuestion ||
        "请分析当前市场状态，给出最值得关注的机会和建议。",
    },
    {
      role: "user",
      content: `以下是实时市场数据：\n\n${analysis}`,
    },
  ];
}
