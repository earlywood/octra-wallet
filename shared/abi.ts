// Hand-rolled ABI encoders for the eth-side bridge calls. We avoid pulling
// ethers/viem just for these three selectors; they're fixed-shape and easy
// to verify against `cast calldata`.

import { BURN_SELECTOR, ETH_BRIDGE, WOCT_ADDR } from './constants';

/** ERC-20 balanceOf(address) — selector 0x70a08231. */
export function encodeBalanceOfCalldata(addr: string): string {
  const sel = '0x70a08231';
  const a = addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  return sel + a;
}

/** ERC-20 approve(address spender, uint256 amount) — selector 0x095ea7b3. */
export function encodeApproveCalldata(spender: string, amountWei: bigint): string {
  const sel = '0x095ea7b3';
  const spenderHex = spender.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const amountHex = amountWei.toString(16).padStart(64, '0');
  return sel + spenderHex + amountHex;
}

// Bridge.burn signature is `burn(string recipient, uint256 amount)` — string
// first, uint second. Solidity ABI for a dynamic-then-static head: a 32-byte
// offset pointing past the head (always 0x40 since head = offset + uint = 64
// bytes), then the uint256 inline, then the string's length and data after
// the head. Mirrors webcli/static/bridge.html's `abiEncodeStringUint(str, uint)`.
export function encodeBurnCalldata(amountWei: bigint, octraRecipient: string): string {
  const offsetHex = (64).toString(16).padStart(64, '0');
  const amountHex = amountWei.toString(16).padStart(64, '0');
  const bytes = new TextEncoder().encode(octraRecipient);
  const lenHex = bytes.length.toString(16).padStart(64, '0');
  let dataHex = '';
  for (const b of bytes) dataHex += b.toString(16).padStart(2, '0');
  const padLen = Math.ceil(bytes.length / 32) * 32;
  dataHex = dataHex.padEnd(padLen * 2, '0');
  return BURN_SELECTOR + offsetHex + amountHex + lenHex + dataHex;
}

// re-export for ergonomic use at call sites that want addresses + encoders together
export { BURN_SELECTOR, ETH_BRIDGE, WOCT_ADDR };
