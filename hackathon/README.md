# DeFi Scout — AI 驱动的 DeFi 量化分析助手

## 一句话

让 AI 帮你发现链上最优收益机会（DEX 套利 · 借贷利差 · 质押收益 · 跨链价差），小额自动执行，大额 Guard 校验后人工确认。

---

## Open Track 四问

| 问题 | 回答 |
|---|---|
| **① 用户是谁？** | 个人 DeFi 用户，有 1000–10000 USDC 资金，不想天天盯盘但也不想全交给机器人 |
| **② AI 让哪步明显更好？** | 把多协议对比（5 个 DEX + 3 个借贷 + 2 个质押 + 2 个跨链桥）从"人肉翻 12 个页面"变成"一句话问答" |
| **③ Web3 让哪步可验证？** | 每笔交易上链，盈亏透明可审计；资金在用户钱包，无需信任中心化平台 |
| **④ 两周可演示闭环？** | Sepolia 测试网，覆盖 DEX 价差 + 借贷利差 + 小额自动执行 |

---

## 功能范围

### Phase 1：数据管道（3-4 天）

| 模块 | 数据源 | 输出 |
|---|---|---|
| **DEX 价差扫描** | Uniswap V2/V3, SushiSwap 各池的 `getReserves` / `quote` | 最优报价 + 滑点估算 |
| **借贷利差对比** | Aave V3, Compound V3 各市场的 supply/borrow APR | 存贷利差排行 |
| **质押收益对比** | Lido stETH, Rocket Pool rETH 的兑换率/APR | 质押年化 + 流动性 |
| **跨链价差** | 同 token 在不同链的 DEX 价格差（ETH mainnet vs Arbitrum vs Optimism） | 跨链套利机会 |

### Phase 2：AI 分析（3-4 天）

| 能力 | 描述 |
|---|---|
| **机会发现** | Agent 定时扫描数据管道，过滤噪音，标注"当前值得关注的机会" |
| **风险解释** | 对每个机会解释：滑点风险、池深度不足风险、MEV 风险、协议风险 |
| **自然语言问答** | 用户可问："我的 1000 USDC 现在怎么分配收益最高？" |
| **交易草稿生成** | 将机会转化为可执行的 calldata（swap/deposit/bridge 等） |

### Phase 3：执行 + Guard（3-4 天）

| 层 | 规则 | 来源 |
|---|---|---|
| **金额上限** | 单笔 ≤ 100 USDC（demo 阶段），日累计 ≤ 500 USDC | 005 Budget |
| **滑点保护** | 超过 1% 自动取消 | 005 Guard |
| **白名单** | 只调用已知协议 Router：Uniswap/Sushi/Aave/Compound/Lido/Rocket Pool/Hop | 005 白名单 |
| **分层决策** | 金额 ≤ 10 USDC 自动执行 / 10–100 USDC 静默确认 / > 100 USDC 弹窗确认 | 005 三层模型 |
| **异常检测** | 目标地址不在白名单、calldata 异常、滑点突变 → 拒绝 | 006 安全测试 |

### Phase 4：演示闭环（2-3 天）

```
用户: "我现在 Sepolia 上有 2000 USDC，帮我看看怎么收益最高"

Agent:
  🔍 扫描中...
  
  DEX 套利:
  • Uniswap V3 USDC/ETH: 1 ETH = 3012 USDC
  • SushiSwap USDC/ETH: 1 ETH = 3018 USDC
  → 价差 0.2%，扣除 gas 后利润约 $2.4，不值得
  
  借贷利差:
  • Aave V3 USDC supply APR: 3.2%
  • Compound V3 USDC borrow APR: 2.8%
  → 无套利空间
  
  质押收益:
  • Lido stETH APR: 3.8%，stETH/ETH = 0.998
  • Rocket Pool rETH APR: 4.1%，rETH/ETH = 1.052
  → rETH 质押 4.1% 为当前最优无风险收益
  
  📊 建议: 将 USDC 换为 ETH → 换为 rETH → 持有赚 4.1% 年化
  ⚠️ 风险: 需 2 笔交易，总 gas ~$6，rETH/ETH 汇率可能波动
  
  [ 🔄 自动执行 ] [ 📋 查看详情 ] [ ❌ 忽略 ]
```

---

## 技术架构

```
┌──────────────────────────────────────────────┐
│  Frontend: Next.js + ethers.js                │
│  聊天面板 + 机会卡片 + 交易确认弹窗             │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────▼───────────────────────────┐
│  AI Agent: Claude API                         │
│  意图理解 / 机会分析 / 风险解释 / 生成回复      │
└──────────────────┬───────────────────────────┘
                   │
       ┌───────────┼───────────┐
       ▼           ▼           ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│ DEX Scan │ │Lend Scan │ │Stake Scan│  ← 数据管道
│ Uniswap  │ │Aave V3   │ │Lido      │     (TypeScript)
│ SushiSwap│ │Compound  │ │RocketPool│
│ V2/V3    │ │          │ │          │
└────┬─────┘ └────┬─────┘ └────┬─────┘
     │            │            │
     └────────────┼────────────┘
                  ▼
┌──────────────────────────────────────────────┐
│  Execution Layer: Viem + Guard                │
│  calldata 生成 → Guard 校验 → 交易发送         │
│  (金额/滑点/白名单/频率 四重检查)              │
└──────────────────────────────────────────────┘
```

---

## 目录结构

```
hackathon/
├── README.md                # 本文件 — 项目方案
├── contracts/               # 合约交互脚本（Viem）
│   ├── dex.ts               # DEX 价格查询 & swap
│   ├── lending.ts           # Aave/Compound 利率查询 & deposit
│   ├── staking.ts           # Lido/Rocket Pool 质押
│   ├── bridge.ts            # 跨链桥费率查询
│   └── guard.ts             # Guard 校验层
├── agent/                   # AI Agent 逻辑
│   ├── analyzer.ts          # 机会聚合 + 排序
│   ├── risk.ts              # 风险评估
│   └── prompts.ts           # Agent 系统提示词
├── frontend/                # Next.js 前端
│   └── ...
└── test/                    # 测试脚本
    └── sepolia-test.ts
```

---

## 复用实验矩阵

```
001 RPC Agent         → 链上数据读取（reserves, rates, balances）
002 Workflow Design   → 分析 → 建议 → 执行的三步工作流
003 eth_call          → 模拟交易，预估 output amount & gas
004 Wallet Map        → 交易确认面板设计
005 Guard + Budget    → 四重校验（金额/滑点/白名单/频率）
006 Security Test     → 异常 token 检测、钓鱼地址识别
```

---

## 开发环境

| 项 | 值 |
|---|---|
| 数据读取 | Ethereum Mainnet（免费公共 RPC） |
| 交易执行 | Sepolia 测试网 |
| RPC | eth.drpc.org / rpc.ankr.com / cloudflare-eth.com |
| 合约 | 已验证的 mainnet 合约地址 |

## 当前状态

```
✅ DEX Scanner       Uniswap V2 / SushiSwap V2        3 pairs，实时价差
✅ Lending Scanner   Aave V3 / Compound V3            跨协议利差对比
✅ Staking Scanner   Lido / Rocket Pool / Frax        3 个 LST 收益排行
⚠️ Bridge Scanner    跨链 4 链框架                     待验证 L2 合约地址
✅ Agent Analyzer    机会聚合 / 风险评分 / 排序         市场快照 + TOP 5
✅ AI Prompts        系统提示词 / 对话模板 / 快捷提问    可集成 Claude/OpenAI API
✅ Guard             6 重校验                          复用 005 实验设计
```

## 实测数据快照（2026-06-11）

```
最优质押:  Rocket Pool rETH @ 16.54% APR
最优存款:  USDC → Aave V3 @ 3.09%
DEX 套利:  价差 0.15%，扣除 gas 后无利润
存贷套利:  Compound 借 USDC @ 0.03% → Aave 存 @ 3.09% (利差 3.06%)
```
| 语言 | TypeScript |
| 运行时 | Node.js 20+ |

---

## 里程碑

```
Week 1 (6/8–6/14):  Phase 1 数据管道 + Phase 2 AI 分析
Week 2 (6/15–6/21): Phase 3 执行 Guard + Phase 4 前端演示闭环
```

> 最后更新：2026-06-08
