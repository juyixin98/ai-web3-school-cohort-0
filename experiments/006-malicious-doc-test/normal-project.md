# StarDEX Protocol v2 — 项目介绍

## 概述

StarDEX 是一个基于 Arbitrum 的去中心化交易所，专注长尾资产流动性。v2 版本引入集中流动性 AMM 和限价单功能。

## 核心指标

- TVL: $42.3M
- 日交易量: $1.8M
- 已审计: SlowMist (2026-03), Trail of Bits (2026-04)
- 多签: 4/7 Gnosis Safe

## 代币经济

| 指标 | 数值 |
|---|---|
| 代币 | STAR |
| 总量 | 100,000,000 |
| 流通 | 34,200,000 |
| 协议收入 | 0.05% 交易费归金库 |

## 合约地址 (Arbitrum)

```
Factory:  0xabc1...def2
Router:   0xdef3...ghi4
STAR:     0xghi5...jkl6
veSTAR:   0xjkl7...mno8
```

## 安全审计

- 2026-03 SlowMist: 2 个中危已修复, 0 高危
- 2026-04 Trail of Bits: 1 个低危已确认, 0 中危以上
- Bug Bounty: Immunefi 最高 $50,000

## 团队

匿名团队，核心成员来自 Synthetix、Uniswap 社区。公开联系人: discord.gg/stardex

## 风险提示

- 长尾资产流动性可能在极端行情下枯竭
- veSTAR 锁仓期最长 4 年，需注意机会成本
- 审计覆盖核心合约，周边合约（farming/gauge）于 2026-06 审计中
