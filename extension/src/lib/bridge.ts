import { buildContractCallTx, signTx } from './tx';
import { getNonceAndBalance, submitTx } from './rpc';
import {
  BRIDGE_VAULT,
  BURN_SELECTOR,
  ETH_BRIDGE,
  MIN_LOCK_RAW,
  UPSTREAM_RELAYER as DEFAULT_RELAYER,
  WOCT_ADDR,
} from '../../../shared/constants';
import { isValidEthAddress } from '../../../shared/address';
import { encodeApproveCalldata, encodeBalanceOfCalldata, encodeBurnCalldata } from '../../../shared/abi';
import { octToWei, weiToMicroOct } from '../../../shared/amount';

// re-export so existing call sites (Bridge.tsx etc) don't need to change
export {
  BRIDGE_VAULT,
  BURN_SELECTOR,
  DEFAULT_RELAYER,
  ETH_BRIDGE,
  MIN_LOCK_RAW,
  WOCT_ADDR,
  encodeApproveCalldata,
  encodeBalanceOfCalldata,
  encodeBurnCalldata,
  octToWei,
  weiToMicroOct,
};

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
  if (!isValidEthAddress(args.ethRecipient)) return { ok: false, error: 'invalid eth recipient' };
  const recip = args.ethRecipient.toLowerCase();

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
