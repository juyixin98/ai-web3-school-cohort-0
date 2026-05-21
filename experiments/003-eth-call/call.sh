#!/bin/bash
# eth_call 实验 — Agent 调用合约方法
# 用法: bash call.sh balanceOf <合约地址> <查询地址>

RPC="${ETH_RPC_URL:-https://ethereum-rpc.publicnode.com}"

# 常用函数选择器 (keccak256 前 4 字节)
# balanceOf(address)     → 0x70a08231
# decimals()             → 0x313ce567
# symbol()               → 0x95d89b41
# totalSupply()          → 0x18160ddd
# allowance(owner,spender) → 0xdd62ed3e
# name()                 → 0x06fdde03

balance_of() {
  local contract="$1"
  local addr="$2"
  local addr_np=$(echo "$addr" | sed 's/0x//' | tr '[:upper:]' '[:lower:]')
  local data="0x70a08231000000000000000000000000${addr_np}"

  echo "查询 ERC-20 余额"
  echo "  合约: $contract"
  echo "  地址: $addr"
  echo "  calldata: $data"
  echo ""

  local result=$(curl -s "$RPC" -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"$contract\",\"data\":\"$data\"},\"latest\"],\"id\":1}")

  local hex=$(echo "$result" | sed 's/.*"result":"\([^"]*\)".*/\1/')
  echo "  原始返回: $hex"

  if [ "$hex" != "0x0000000000000000000000000000000000000000000000000000000000000000" ] && [ -n "$hex" ]; then
    python3 -c "raw=int('$hex',16); print(f'  余额: {raw} (raw)')" 2>/dev/null
  else
    echo "  余额: 0"
  fi
}

get_decimals() {
  local contract="$1"
  local data="0x313ce567"
  local result=$(curl -s "$RPC" -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"$contract\",\"data\":\"$data\"},\"latest\"],\"id\":1}")
  local hex=$(echo "$result" | sed 's/.*"result":"\([^"]*\)".*/\1/')
  echo "decimals: $((16#${hex#0x}))"
}

get_symbol() {
  local contract="$1"
  local data="0x95d89b41"
  local result=$(curl -s "$RPC" -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"$contract\",\"data\":\"$data\"},\"latest\"],\"id\":1}")
  local hex=$(echo "$result" | sed 's/.*"result":"\([^"]*\)".*/\1/')
  # 解码 string: 跳过 32 字节 offset + 32 字节 length，然后 hex→ascii
  local str_hex=$(echo "$hex" | sed 's/^0x//')
  local offset=$((16#${str_hex:0:64}))
  local len=$((16#${str_hex:64:64}))
  local str_start=$((128 + offset * 2))
  local str_hex_data="${str_hex:$str_start:$((len * 2))}"
  echo "symbol: $(echo "$str_hex_data" | xxd -r -p 2>/dev/null)"
}

case "$1" in
  balanceOf) balance_of "$2" "$3" ;;
  decimals)  get_decimals "$2" ;;
  symbol)    get_symbol "$2" ;;
  *)
    echo "用法:"
    echo "  bash call.sh balanceOf <合约地址> <查询地址>"
    echo "  bash call.sh decimals <合约地址>"
    echo "  bash call.sh symbol <合约地址>"
    echo ""
    echo "环境变量 ETH_RPC_URL 可切换 RPC 节点"
    ;;
esac
