# 001 — RPC Agent 最小实验

## 目标

演示 Agent 如何通过 JSON-RPC 查询真实链上数据，理解「Agent 的眼睛」如何工作。

## 核心概念

Agent 本身不直接「知道」链上状态。它通过 **Tool Use 循环** 完成链上感知：

```
用户/任务 → Agent 推理 → 选择 RPC 工具 → 发送 JSON-RPC 请求
    → 链节点返回 JSON → Agent 解析结果 → 继续推理或输出答案
```

## 实验内容

| 查询 | RPC 方法 | 结果 |
|---|---|---|
| 最新区块号 | `eth_blockNumber` | 25,128,096 |
| EF 地址余额 | `eth_getBalance` | ~10,774.45 ETH |
| 当前 Gas 价格 | `eth_gasPrice` | ~0.16 Gwei |

## 使用的 RPC 节点

- `https://ethereum-rpc.publicnode.com`（公共节点，无需 API key）

## 关键发现

1. **Agent ≠ 全知**：模型训练数据有截止时间，链上实时状态必须通过 RPC 获取
2. **Tool 是桥梁**：RPC 方法（eth_blockNumber 等）就是 Agent 的 tool，和 Web2 中的 API tool 本质相同
3. **格式转换**：链上数据是 hex（0x...），Agent 需要解析为人类可读格式（decimal / ETH / Gwei）
4. **安全边界**：eth_call 是只读的，安全；eth_sendTransaction 涉及签名和资产，需要权限控制

## 文件

- `query.sh` — 可复用的链上查询脚本
