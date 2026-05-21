# 002 — Agent Workflow 设计：小额 ERC-20 Swap

## 目标

为「解释并准备一笔小额 ERC-20 swap」设计完整的链上 Agent 工作流，包含 Task Graph、State Machine、Human-in-the-loop 标记、失败处理和 Regression Cases。

## 任务定义

> 用户说：「帮我把 100 USDC 换成 USDT，滑点不超过 1%」

Agent 的工作不是一句「好的我帮你换」，而是把这个意图拆成可验证、可停止、可复盘的安全步骤。

---

## Task Graph（任务图）

```
  [用户输入]
      │
      ▼
┌─────────────────────────────────────────────────┐
│ Step 1: 解析用户意图                              │  ◄── 自动
│ 输入: 用户消息                                     │
│ 输出: {action: "swap", fromToken, toToken,        │
│         amount, maxSlippage, chainId}             │
└─────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────┐
│ Step 2: 加载链上上下文                             │  ◄── 自动
│ 输入: userAddress, fromToken, toToken             │
│ 输出: {balance, allowance, gasPrice, nonce,       │
│         tokenDecimals, chainId}                   │
└─────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────┐
│ Step 3: 查询价格与流动性                           │  ◄── 自动
│ 输入: fromToken, toToken, amount, chainId         │
│ 输出: {quote, priceImpact, route, poolLiquidity}  │
└─────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────┐
│ Step 4: 生成候选交易                               │  ◄── 自动
│ 输入: quote + 用户约束 (amount, slippage)          │
│ 输出: {calldata, to, value, expectedOutput,        │
│         minOutput, deadline, gasEstimate}          │
└─────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────┐
│ Step 5: 模拟交易                                  │  ◄── 自动
│ 输入: calldata, from, to, value                   │
│ 输出: {success, gasUsed, stateChanges,            │
│         balanceDelta, transferEvents, logs}       │
└─────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────┐
│ Step 6: 风险评估 + 用户确认                        │  ⚠️ HITL
│ 展示: 你即将用 100 USDC 换取 ~99.8 USDT            │
│       Gas: ~$3.2 | 滑点: 0.3% | 路由: USDC→USDT   │
│       模拟结果: ✅ 通过                            │
│ 用户: [确认] / [拒绝] / [修改参数]                  │
└─────────────────────────────────────────────────┘
      │ (用户确认)
      ▼
┌─────────────────────────────────────────────────┐
│ Step 7: 执行交易                                  │  ◄── 自动提交
│ 输入: signedTx (用户签名后的交易)                   │
│ 输出: {txHash, status: "submitted"}               │
│ 进入 pending 等待状态                              │
└─────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────┐
│ Step 8: 追踪确认 + 记录                            │  ◄── 自动
│ 输入: txHash                                      │
│ 输出: {status: confirmed|reverted, blockNumber,   │
│         gasUsed, actualOutput, trace}             │
│ 写入 Trace 记录                                   │
└─────────────────────────────────────────────────┘
```

---

## 每一步详细设计

### Step 1: 解析用户意图

| 维度 | 内容 |
|---|---|
| **自动/人工** | 🤖 自动 |
| **输入** | 用户自然语言消息 |
| **输出** | 结构化意图 JSON |
| **工具** | LLM 意图解析（NL→结构化） |
| **失败处理** | 意图不明确 → 追问用户（缺 token/金额/链） |
| **停止条件** | 金额为 0、token 不存在、链不支持 |

```
输入示例: "帮我把 100 USDC 换成 USDT，滑点不超过 1%"
输出示例:
{
  "action": "swap",
  "fromToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",  // USDC
  "toToken":   "0xdAC17F958D2ee523a2206206994597C13D831ec7",  // USDT
  "amount": "100000000",   // 100 USDC (6 decimals)
  "maxSlippage": 100,      // 1% = 100 bps
  "chainId": 1,            // Ethereum mainnet
  "userAddress": "0x..."
}
```

### Step 2: 加载链上上下文

| 维度 | 内容 |
|---|---|
| **自动/人工** | 🤖 自动 |
| **输入** | userAddress, fromToken, toToken |
| **输出** | 链上状态快照 |
| **工具** | `eth_getBalance`, `eth_call(balanceOf)`, `eth_call(allowance)`, `eth_gasPrice`, `eth_getTransactionCount` |
| **失败处理** | RPC 失败 → 切换备用节点重试（最多 3 次），仍失败则停止并报告 |
| **停止条件** | 余额不足 → 立即停止，告知用户缺多少 |

```
工具调用链:
  1. eth_getBalance(userAddress)           → ETH 余额 (付 gas)
  2. eth_call(balanceOf, fromToken, user)  → USDC 余额
  3. eth_call(allowance, fromToken, user, router) → 授权额度
  4. eth_gasPrice                          → 当前 gas 价格
  5. eth_getTransactionCount(userAddress)  → nonce

汇总输出: { balance: "100 USDC", allowance: "∞", gasBalance: "0.5 ETH", gasPrice: "20 Gwei" }
```

### Step 3: 查询价格与流动性

| 维度 | 内容 |
|---|---|
| **自动/人工** | 🤖 自动 |
| **输入** | fromToken, toToken, amount |
| **输出** | 报价、价格影响、路由 |
| **工具** | DEX Quoter 合约 `quoteExactInput`（eth_call 只读）、聚合器 API |
| **失败处理** | 流动性不足 → 尝试替代路由 → 仍不足则告知用户 |
| **停止条件** | 无可路由路径、价格影响 >5%（即使用户没设限） |

```
输出: { quote: "99.8 USDT", priceImpact: "0.3%", route: "USDC→USDT (Uniswap V3)", liquidity: "$12M" }
```

### Step 4: 生成候选交易

| 维度 | 内容 |
|---|---|
| **自动/人工** | 🤖 自动 |
| **输入** | quote + 用户约束 |
| **输出** | 待签名交易参数 |
| **工具** | SwapRouter `exactInput` 编码、eth_estimateGas |
| **失败处理** | Gas 估算异常 → 使用历史均值 + 20% buffer |
| **停止条件** | 预期输出低于 minOutput（滑点过大） |

```
minOutput = expectedOutput * (1 - maxSlippage)
         = 99.8 * 0.99 = 98.8 USDT

输出: {
  to: "0x...SwapRouter",
  calldata: "0x...",
  value: "0",
  expectedOutput: "99.8 USDT",
  minOutput: "98.8 USDT",
  gasEstimate: 180000,
  deadline: currentTime + 20min
}
```

### Step 5: 模拟交易

| 维度 | 内容 |
|---|---|
| **自动/人工** | 🤖 自动 |
| **输入** | calldata, from, to |
| **输出** | 模拟结果 |
| **工具** | `eth_call` (overrides)、Tenderly Simulation API |
| **失败处理** | 模拟失败 → 分析原因（revert reason）→ 报告用户 |
| **停止条件** | 模拟 revert → 不进入确认环节，直接报告失败原因 |

```
Tenderly 模拟输出:
{
  success: true,
  gasUsed: 152000,
  stateChanges: {
    USDC: -100,
    USDT: +99.8
  },
  transferEvents: [...],
  warnings: []
}
```

### Step 6: 风险评估 + 用户确认 ⚠️ HITL

| 维度 | 内容 |
|---|---|
| **自动/人工** | 👤 **Human-in-the-loop** |
| **输入** | Step 1-5 的全部结果 |
| **输出** | 用户决策 |
| **展示给用户** | 结构化风险报告（见下方） |
| **失败处理** | 用户拒绝 → 记录原因，停止流程 |
| **用户选项** | 确认 / 拒绝 / 修改参数（滑点/金额） |

---

**用户看到的确认面板：**

```
╔══════════════════════════════════════════╗
║  🔄 Swap 确认                             ║
╠══════════════════════════════════════════╣
║  支付:  100.00 USDC                       ║
║  获得:  ~99.80 USDT                       ║
║  滑点:  0.3% (max 1%)                     ║
║  路由:  Uniswap V3 (USDC→USDT)            ║
║  Gas:   ~$3.20 (152,000 gas)              ║
║  模拟:  ✅ 通过                            ║
║  风险:  🟢 低 (小额 + 主流币 + 高流动性)   ║
╠══════════════════════════════════════════╣
║  [ ✅ 确认 ]  [ ✏️ 修改 ]  [ ❌ 拒绝 ]    ║
╚══════════════════════════════════════════╝
```

### Step 7: 执行交易

| 维度 | 内容 |
|---|---|
| **自动/人工** | 🤖 自动提交（用户已签名） |
| **输入** | 用户签名的交易 |
| **输出** | txHash + 提交确认 |
| **工具** | `eth_sendRawTransaction` |
| **失败处理** | 见下方状态机 |
| **禁止操作** | 已提交但 pending 时：**绝不**重新发送 |

```
提交后 Agent 回复:
"交易已提交 ✅
 txHash: 0x7a3b...
 当前状态: pending (等待区块确认中...)
 预计确认时间: ~12 秒
 查看: https://etherscan.io/tx/0x7a3b..."
```

### Step 8: 追踪确认 + 记录

| 维度 | 内容 |
|---|---|
| **自动/人工** | 🤖 自动 |
| **输入** | txHash |
| **输出** | 最终状态 + Trace 记录 |
| **工具** | `eth_getTransactionReceipt`（轮询直到确认） |
| **失败处理** | 超时 → 标记 unknown，人工复查 |

---

## State Machine（状态机）

```
                    ┌──────────┐
         ┌─────────→│  DRAFT   │←─────────┐
         │          └────┬─────┘          │
         │               │ 意图解析完成    │ (修改参数)
         │               ▼                │
         │          ┌──────────┐          │
         │          │ CONTEXT  │          │
         │          └────┬─────┘          │
         │               │ 链上数据就绪    │
         │               ▼                │
         │          ┌──────────┐          │
         │          │ PRICING  │          │
         │          └────┬─────┘          │
         │               │ 报价完成        │
         │               ▼                │
         │          ┌──────────┐          │
         │          │  PLAN    │          │
         │          └────┬─────┘          │
         │               │ calldata 生成   │
         │               ▼                │
         │          ┌──────────┐    模拟失败
         │          │SIMULATING│──────────┐
         │          └────┬─────┘          │
         │               │ 模拟通过       │
         │               ▼                │
         │     ┌──────────────────┐       │
         │     │ WAITING_CONFIRM  │       │
         │     └───┬──────┬───────┘       │
         │         │      │ 用户拒绝       │
         │    确认  │      └───────────────┤
         │         │                      │
         │         ▼                      ▼
         │   ┌──────────┐          ┌──────────┐
         │   │SUBMITTED │          │CANCELLED │
         │   └────┬─────┘          └──────────┘
         │        │
         │   ┌────┴─────┐
         │   ▼          ▼
         │ ┌────┐  ┌──────────┐
         │ │CONF│  │ REVERTED │
         │ └────┘  └──────────┘
         │
         └── 所有失败路径最终回到 DRAFT
```

---

## Human-in-the-Loop 标记汇总

| Step | 操作 | 风险等级 | 自动/人工 |
|---|---|---|---|
| 1 解析意图 | 理解用户需求 | 无 | 🤖 自动 |
| 2 读取上下文 | 查余额、allowance | 无 | 🤖 自动 |
| 3 查询价格 | DEX 报价 | 无 | 🤖 自动 |
| 4 生成交易 | 构造 calldata | 低 | 🤖 自动 |
| 5 模拟交易 | Tenderly 模拟 | 无 | 🤖 自动 |
| **6 确认** | **展示风险，等待确认** | **高** | **👤 HITL** |
| 7 执行 | 发送交易 | 中 | 🤖 自动（已确认） |
| 8 追踪记录 | 等确认、写 trace | 无 | 🤖 自动 |

**关键设计原则**：
- Step 1-5 全部自动，不打断用户——用户只在 Step 6 做一个决定
- Step 6 是唯一的 HITL 点，但用户看到的不是技术细节，而是**结构化风险报告**
- 低风险路由（小额 + 主流币 + 高流动性）可考虑 session key 自动授权，但首次仍建议确认

---

## 5 个 Regression Case

### Case 1: ✅ 正常 swap

```json
{
  "name": "正常小额 USDC→USDT swap",
  "userMessage": "帮我把 100 USDC 换成 USDT，滑点不超过 1%",
  "mockState": {
    "USDC_balance": "500000000",
    "USDC_allowance": "max",
    "ETH_balance": "2000000000000000000",
    "gasPrice": "20000000000",
    "quote": "99.8 USDT",
    "priceImpact": "0.3%",
    "simulation": "success"
  },
  "expectedBehavior": "全部步骤通过 → 展示确认面板 → 用户确认 → 执行 → 记录",
  "assertions": [
    "Step 1 正确解析 fromToken=USDC, toToken=USDT, amount=100",
    "Step 2 余额和 allowance 均充足，不触发停止",
    "Step 5 模拟通过，不触发停止",
    "Step 6 必须展示确认面板（HITL），不能自动跳过",
    "Step 7 只在确认后执行，不接受跳过"
  ]
}
```

### Case 2: ❌ 错误链

```json
{
  "name": "用户指定的 token 不在当前链",
  "userMessage": "帮我把 100 USDC 换成 USDT",
  "mockState": {
    "chainId": 1,
    "USDC_on_chain": false,
    "USDT_on_chain": false
  },
  "expectedBehavior": "Step 1 报错：无法解析 token 地址 → 停止",
  "assertions": [
    "Agent 不自行猜测 token 地址（不能换一个链就自动选另一个合约）",
    "Agent 明确告知用户：当前链找不到该 token",
    "Agent 不进入 Step 2，直接停止"
  ]
}
```

### Case 3: ⚠️ 滑点过大

```json
{
  "name": "流动性薄导致滑点超过用户设定",
  "userMessage": "帮我把 100 USDC 换成 USDT，滑点不超过 1%",
  "mockState": {
    "balance": "OK",
    "quote": "97 USDT",
    "priceImpact": "3.5%"
  },
  "expectedBehavior": "Step 3 发现 priceImpact > maxSlippage → 停止，告知用户",
  "assertions": [
    "Agent 不生成交易（不进入 Step 4）",
    "Agent 告知用户：当前报价 97 USDT，滑点 3.5%，超过你设的 1%",
    "Agent 给出用户可操作的选项：放宽滑点 / 降低金额 / 取消"
  ]
}
```

### Case 4: ❌ 余额不足

```json
{
  "name": "用户 USDC 余额不足以完成 swap",
  "userMessage": "帮我把 1000 USDC 换成 USDT",
  "mockState": {
    "USDC_balance": "50000000",
    "ETH_balance": "OK",
    "quote": "OK",
    "simulation": "not reached"
  },
  "expectedBehavior": "Step 2 发现余额不足 → 立即停止",
  "assertions": [
    "Agent 不继续查价格（节省 RPC 调用）",
    "Agent 告知用户：你只有 50 USDC，需要 1000 USDC，差 950",
    "Agent 不进入 Step 3"
  ]
}
```

### Case 5: 👤 用户拒绝

```json
{
  "name": "用户在确认环节主动拒绝",
  "userMessage": "帮我把 100 USDC 换成 USDT",
  "mockState": {
    "balance": "OK",
    "quote": "99.8 USDT",
    "simulation": "success",
    "userDecision": "reject"
  },
  "expectedBehavior": "Step 6 用户点拒绝 → 状态变为 CANCELLED → 写入 Trace",
  "assertions": [
    "Agent 不执行交易（不进入 Step 7）",
    "Agent 记录拒绝原因到 Trace",
    "状态机正确进入 CANCELLED 而非 DRAFT",
    "Agent 不催促用户、不反复建议"
  ]
}
```

---

## 核心设计原则总结

1. **前 5 步全自动，只在确认点（Step 6）引入人** — 不过度打断用户
2. **每步有明确的停止条件和失败处理** — 不在异常状态继续
3. **只读调用放心重试，写操作绝不盲重** — 链上安全第一
4. **用户确认的不是技术细节，而是结构化风险报告** — 让人能看懂再决定
5. **每个状态可追踪、可复盘** — 出问题能定位是哪一步错了
