export const WOCT_ADDR  = '0x4647e1fE715c9e23959022C2416C71867F5a6E80';
export const ETH_BRIDGE = '0xE7eD69b852fd2a1406080B26A37e8E04e7dA4caE';
export const DEFAULT_RELAYER = 'https://relayer-002838819188.octra.network';
export const DEFAULT_OCTRA_RPC = 'https://octra.network/rpc';
export const DEFAULT_OCTRA_EXPLORER = 'https://octrascan.io';
// publicnode is well-behaved on CORS for browser origins. llamarpc and
// cloudflare-eth both have intermittent rate-limit / preflight problems.
export const DEFAULT_ETH_RPC = 'https://ethereum-rpc.publicnode.com';
export const ETH_CHAIN_ID = 1;
export const BURN_SELECTOR = '0xe3e3aed0';

const MICRO_PER_OCT = 1_000_000n;

export function parseAmountToRaw(s: string): string {
  s = String(s).trim();
  if (!s) return '0';
  const dot = s.indexOf('.');
  if (dot < 0) {
    if (!/^\d+$/.test(s)) throw new Error('invalid amount');
    return (BigInt(s) * MICRO_PER_OCT).toString();
  }
  const ip = s.slice(0, dot);
  let fp = s.slice(dot + 1);
  if (ip && !/^\d+$/.test(ip)) throw new Error('invalid amount');
  if (fp && !/^\d+$/.test(fp)) throw new Error('invalid amount');
  if (fp.length > 6) fp = fp.slice(0, 6);
  while (fp.length < 6) fp += '0';
  const ipN = ip ? BigInt(ip) : 0n;
  return (ipN * MICRO_PER_OCT + BigInt(fp || '0')).toString();
}

export function formatRawAmount(raw: string | bigint): string {
  const v = typeof raw === 'bigint' ? raw : BigInt(raw || '0');
  const whole = v / MICRO_PER_OCT;
  const frac = (v % MICRO_PER_OCT).toString().padStart(6, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

// wOCT has 6 decimals on Ethereum (matching OCT's native micro-unit), NOT
// the 18 decimals a typical ERC-20 uses. So 1 OCT in raw form (= 1_000_000
// micro-OCT) equals 1 wOCT in its smallest unit. These conversions are
// therefore identity — defined as functions so the assumption lives in one
// auditable place and call sites remain expressive.
export function octToWei(microOct: string | bigint): bigint {
  return typeof microOct === 'bigint' ? microOct : BigInt(microOct);
}

export function weiToMicroOct(wei: bigint): bigint {
  return wei;
}

export function encodeBalanceOfCalldata(addr: string): string {
  const sel = '0x70a08231';
  const a = addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  return sel + a;
}

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
