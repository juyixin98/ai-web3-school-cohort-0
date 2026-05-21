# 003 — eth_call 进阶实验：Agent 调用合约方法

## 目标

对比 `eth_getBalance` 和 `eth_call` 的区别，理解 Agent 如何通过 `eth_call` 读取任意智能合约状态。

## 实验数据

| 方法 | 查询目标 | 结果 |
|---|---|---|
| `eth_getBalance` | vitalik.eth 原生 ETH | 5.6767 ETH |
| `eth_call(balanceOf)` | vitalik.eth 的 USDT 余额 | 290.25 USDT |

## 核心对比

| | eth_getBalance | eth_call |
|---|---|---|
| 查询内容 | 原生 ETH 余额 | 任意合约方法 |
| 需要合约地址 | 不需要 | 需要 |
| 需要编码 data | 不需要 | 需要（4字节选择器+ABI参数） |
| 消耗 gas | 0（只读） | 0（只读） |
| 安全性 | 安全 | 安全（只读，不修改状态） |
| 适用场景 | 查 ETH | 查 ERC-20、allowance、报价、NFT owner… |

## 为什么 eth_call 对 Agent 更重要

Agent 在链上场景中，大部分时候不是查 ETH 余额，而是：

| Agent 想知道 | 用的方法 |
|---|---|
| 我还有多少 USDC？ | `eth_call → balanceOf` |
| 授权给 Router 多少额度？ | `eth_call → allowance` |
| 这笔 swap 能换多少？ | `eth_call → quoteExactInput` |
| 这个 NFT 属于谁？ | `eth_call → ownerOf` |
| 这个合约的费率是多少？ | `eth_call → fee` |

所有这些都走 **eth_call**。Agent 不直接知道合约状态——它只知道函数选择器和 ABI，然后拼 calldata 发请求。

## eth_call 工作流

```
Agent 推理: "用户想知道他的 USDC 余额"
     │
     ▼
1. 确定合约地址 (USDC = 0xA0b86991...)
     │
     ▼
2. 编码 calldata:
   balanceOf(address) → 0x70a08231
   用户地址         → 0x000...<user>
   calldata = 0x70a08231000...<user>
     │
     ▼
3. 发送 JSON-RPC:
   {"method":"eth_call","params":[{"to":"0xA0b8...","data":"0x70a08231..."},"latest"]}
     │
     ▼
4. 解析返回:
   0x000...<balance_hex> → decimal → / 10^decimals → "100 USDC"
     │
     ▼
5. Agent 回答: "你有 100 USDC"
```

## 关键发现

1. **eth_call 是 Agent 读取链上世界的主要窗口** — 相比 eth_getBalance 只能查 ETH，eth_call 可以读任何合约的任意只读方法
2. **Agent 需要 ABI 知识** — 要知道 balanceOf(address) 怎么编码，返回什么格式，这是 Web3 Tool Use 的核心能力
3. **只读 = 安全** — eth_call 不消耗 gas，不修改状态，Agent 可以放心调用
4. **eth_sendTransaction 才是危险的那个** — 它才需要签名，需要走我们设计的 Agent Workflow

## 文件

- `call.sh` — 可复用的 eth_call 脚本
