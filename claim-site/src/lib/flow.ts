import { getOctraTxEpoch } from './octraRpc';
import { relayerCall, type BridgeHeaderResult } from './relayer';

export async function pollUntilEpoch(rpcUrl: string, txHash: string, signal: AbortSignal, intervalMs = 4000, timeoutMs = 5 * 60_000): Promise<number> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (signal.aborted) throw new Error('aborted');
    const epoch = await getOctraTxEpoch(rpcUrl, txHash);
    if (epoch != null) return epoch;
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
