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

export async function pollUntilHeader(relayerUrl: string, epoch: number, signal: AbortSignal, intervalMs = 5000, timeoutMs = 10 * 60_000): Promise<BridgeHeaderResult> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (signal.aborted) throw new Error('aborted');
    const r = await relayerCall<BridgeHeaderResult>(relayerUrl, 'bridgeHeader', [epoch]);
    if (r.ok && r.result && (r.result.message_count ?? 0) > 0) return r.result;
    await sleep(intervalMs, signal);
  }
  throw new Error('relayer did not publish header within 10min');
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'));
    const t = setTimeout(() => resolve(), ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); }, { once: true });
  });
}
