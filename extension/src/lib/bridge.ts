import { buildContractCallTx, signTx } from './tx';
import { getNonceAndBalance, submitTx } from './rpc';

export const BRIDGE_VAULT = 'oct5MrNfjiXFNRDLwsodn8Zm9hDKNGAYt3eQDCQ52bSpCHq';
export const WOCT_ADDR    = '0x4647e1fE715c9e23959022C2416C71867F5a6E80';
export const ETH_BRIDGE   = '0xE7eD69b852fd2a1406080B26A37e8E04e7dA4caE';
export const DEFAULT_RELAYER = 'https://relayer-002838819188.octra.network';
export const BURN_SELECTOR = '0xe3e3aed0';

let relayerId = 0;

export interface RelayerOk<T = unknown> { ok: true; result: T }
export interface RelayerErr { ok: false; error: string }
export type RelayerResult<T = unknown> = RelayerOk<T> | RelayerErr;

export async function relayerCall<T = unknown>(
  url: string,
  method: 'bridgeStatus' | 'bridgeHeader' | 'bridgeMessagesByEpoch' | 'bridgeProofByLeafIndex' | 'bridgeClaimCalldata',
  params: unknown[] = [],
  timeoutMs = 15_000,
): Promise<RelayerResult<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++relayerId, method, params }),
      signal: ctrl.signal,
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const j = await r.json();
    if ('result' in j) return { ok: true, result: j.result as T };
    return { ok: false, error: j.error?.message ?? 'relayer error' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

export interface LockResult { ok: boolean; tx_hash?: string; error?: string }

export async function lockOctToEth(args: {
  rpc: string;
  from: string;
  ethRecipient: string;
  amountRaw: string;
  privSeed32: Uint8Array;
  publicKeyB64: string;
}): Promise<LockResult> {
  const recip = args.ethRecipient.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(recip)) return { ok: false, error: 'invalid eth recipient' };

  const { nonce } = await getNonceAndBalance(args.rpc, args.from);
  const tx = buildContractCallTx({
    from: args.from,
    contract: BRIDGE_VAULT,
    method: 'lock_to_eth',
    params: [recip],
    amountRaw: args.amountRaw,
    nonce: nonce + 1,
    ou: '1000',
  });
  const signed = signTx(tx, args.privSeed32, args.publicKeyB64);
  const r = await submitTx(args.rpc, signed);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, tx_hash: r.result?.tx_hash };
}

function abiEncodeBurn(amountWei: bigint, octraRecipient: string): string {
  const amountHex = amountWei.toString(16).padStart(64, '0');
  const offsetHex = (64).toString(16).padStart(64, '0');
  const bytes = new TextEncoder().encode(octraRecipient);
  const lenHex = bytes.length.toString(16).padStart(64, '0');
  let dataHex = '';
  for (const b of bytes) dataHex += b.toString(16).padStart(2, '0');
  const padLen = Math.ceil(bytes.length / 32) * 32;
  dataHex = dataHex.padEnd(padLen * 2, '0');
  return amountHex + offsetHex + lenHex + dataHex;
}

export function encodeBurnCalldata(amountWei: bigint, octraRecipient: string): string {
  return BURN_SELECTOR + abiEncodeBurn(amountWei, octraRecipient);
}

export function encodeApproveCalldata(spender: string, amountWei: bigint): string {
  const sel = '0x095ea7b3';
  const spenderHex = spender.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const amountHex = amountWei.toString(16).padStart(64, '0');
  return sel + spenderHex + amountHex;
}

export function encodeBalanceOfCalldata(addr: string): string {
  const sel = '0x70a08231';
  const a = addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  return sel + a;
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
