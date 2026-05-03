import { getOctraTxStatus } from './octraRpc';
import { fetchRecovery, findLockInRecovery, relayerCall, type BridgeHeaderResult } from './relayer';

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

// Two parallel signals — whichever fires first wins:
//   (a) bridgeHeader RPC returns message_count > 0
//   (b) recovery.json contains our lock tx_hash (gives us epoch + leaf_index
//       directly, lets us skip bridgeMessagesByEpoch entirely)
// recovery.json sits on a different cache path than the JSON-RPC endpoints,
// so when bridgeHeader is stuck on a stale empty cache, this still resolves.
export type WaitForHeaderResult =
  | { source: 'header'; epoch: number }
  | { source: 'recovery'; epoch: number; leafIndex: number }
  | { source: 'already_claimed' };

export async function waitForHeader(
  relayerUrl: string,
  epoch: number,
  ethRecipient: string,
  lockTxHash: string,
  signal: AbortSignal,
): Promise<WaitForHeaderResult> {
  const start = Date.now();

  const headerLoop = (async (): Promise<WaitForHeaderResult> => {
    while (true) {
      if (signal.aborted) throw new Error('aborted');
      const r = await relayerCall<BridgeHeaderResult>(relayerUrl, 'bridgeHeader', [epoch]);
      if (r.ok && r.result && (r.result.message_count ?? 0) > 0) return { source: 'header', epoch };
      const elapsedSec = (Date.now() - start) / 1000;
      const intervalMs = elapsedSec < 120 ? 5_000 : elapsedSec < 600 ? 15_000 : 60_000;
      await sleep(intervalMs, signal);
    }
  })();

  const recoveryLoop = (async (): Promise<WaitForHeaderResult> => {
    while (true) {
      if (signal.aborted) throw new Error('aborted');
      const doc = await fetchRecovery(relayerUrl, signal);
      if (doc) {
        const lookup = findLockInRecovery(doc, ethRecipient, lockTxHash, epoch);
        if (lookup.kind === 'found')           return { source: 'recovery', epoch: lookup.epoch, leafIndex: lookup.leaf_index };
        if (lookup.kind === 'already_claimed') return { source: 'already_claimed' };
      }
      // recovery.json is regenerated every 30s server-side, so no point polling faster
      await sleep(15_000, signal);
    }
  })();

  return Promise.race([headerLoop, recoveryLoop]);
}

// kept exported for any callers that only want the bridgeHeader signal
export async function pollUntilHeader(relayerUrl: string, epoch: number, signal: AbortSignal): Promise<BridgeHeaderResult> {
  const start = Date.now();
  while (true) {
    if (signal.aborted) throw new Error('aborted');
    const r = await relayerCall<BridgeHeaderResult>(relayerUrl, 'bridgeHeader', [epoch]);
    if (r.ok && r.result && (r.result.message_count ?? 0) > 0) return r.result;
    const elapsedSec = (Date.now() - start) / 1000;
    const intervalMs = elapsedSec < 120 ? 5_000 : elapsedSec < 600 ? 15_000 : 60_000;
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
