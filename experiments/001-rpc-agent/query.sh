#!/bin/bash
# RPC Agent 最小实验 — 链上查询脚本
# 用法: bash query.sh <命令> [参数]
#
# 命令:
#   block              查询最新区块号
#   balance <地址>      查询地址 ETH 余额
#   gas                 查询当前 Gas 价格

RPC="${ETH_RPC_URL:-https://ethereum-rpc.publicnode.com}"

block_number() {
  local result=$(curl -s "$RPC" -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}')
  local hex=$(echo "$result" | sed 's/.*"result":"\([^"]*\)".*/\1/')
  echo "最新区块: $hex (decimal: $((16#${hex#0x})))"
}

get_balance() {
  local addr="$1"
  local result=$(curl -s "$RPC" -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBalance\",\"params\":[\"$addr\",\"latest\"],\"id\":2}")
  local hex=$(echo "$result" | sed 's/.*"result":"\([^"]*\)".*/\1/')
  echo "地址: $addr"
  echo "余额: $hex wei"
  python3 -c "wei=int('$hex',16); print(f'     ≈ {wei / 1e18:,.4f} ETH')" 2>/dev/null || true
}

get_gas() {
  local result=$(curl -s "$RPC" -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","method":"eth_gasPrice","params":[],"id":3}')
  local hex=$(echo "$result" | sed 's/.*"result":"\([^"]*\)".*/\1/')
  local gwei=$((16#${hex#0x} / 1000000000))
  echo "Gas 价格: $hex (≈ $gwei Gwei)"
}

case "$1" in
  block)   block_number ;;
  balance) get_balance "$2" ;;
  gas)     get_gas ;;
  *)
    echo "用法: bash query.sh block | balance <地址> | gas"
    echo "可设置 ETH_RPC_URL 环境变量切换节点"
    ;;
esac
