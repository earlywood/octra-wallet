import { getOctraTxStatus } from './octraRpc';
import { relayerCall, type BridgeHeaderResult } from './relayer';

export class LockRejectedError extends Error {
  reason: string;
  constructor(reason: string) {
    super(`lock reverted on octra: ${reason}`);
    this.name = 'LockRejectedError';
    this.reason = reason;
  }
}

export async function pollUntilEpoch(rpcUrl: string, txHash: string, signal: AbortSignal, intervalMs = 4000, timeoutMs = 5 * 60_000): Promise<number> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (signal.aborted) throw new Error('aborted');
    const tx = await getOctraTxStatus(rpcUrl, txHash);
    if (tx) {
      // octra sets epoch on rejected txs too, so we can't use it as a
      // success signal in isolation. check status / source first.
      if (tx.status === 'rejected' || tx.source === 'rejected_txs') {
        const reason = tx.error?.reason ?? tx.error?.type ?? 'unknown — see octrascan';
        throw new LockRejectedError(reason);
      }
      if (tx.epoch != null) return tx.epoch;
    }
    await sleep(intervalMs, signal);
  }
  throw new Error('lock tx not finalized within 5min');
}

// No timeout. The relayer is third-party infra we don't control; if it's
// backed up, throwing 'timed out' just punishes the user for waiting and
// loses the in-flight state. Instead poll forever until the abort signal
// fires (component unmounts / user closes tab). Adaptive backoff keeps us
// from hammering the relayer once we're past the typical ETA window.
export async function pollUntilHeader(relayerUrl: string, epoch: number, signal: AbortSignal): Promise<BridgeHeaderResult> {
  const start = Date.now();
  while (true) {
    if (signal.aborted) throw new Error('aborted');
    const r = await relayerCall<BridgeHeaderResult>(relayerUrl, 'bridgeHeader', [epoch]);
    if (r.ok && r.result && (r.result.message_count ?? 0) > 0) return r.result;
    const elapsedSec = (Date.now() - start) / 1000;
    const intervalMs = elapsedSec < 120 ? 5_000      // first 2 min: every 5s
                    :  elapsedSec < 600 ? 15_000     // 2–10 min: every 15s
                    :  60_000;                        // beyond that: every 60s
    await sleep(intervalMs, signal);
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'));
    const t = setTimeout(() => resolve(), ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); }, { once: true });
  });
}
