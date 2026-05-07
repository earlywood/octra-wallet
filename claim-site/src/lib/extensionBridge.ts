// Pings the Unofficial Octra Wallet extension's service worker via
// chrome.runtime.sendMessage when a bridge step completes here on the claim
// site, so the popup's "recent bridges" entry flips to claimed/burn_confirmed
// instantly instead of waiting for its recovery.json poll loop to detect it.
//
// The extension declares this origin in its manifest under
// `externally_connectable.matches`, so chrome routes the message through its
// onMessageExternal handler. If the user is on a self-hosted claim site whose
// origin isn't in that allowlist, sendMessage just throws — we swallow it,
// the popup's polling fallback still catches up eventually.
//
// The extension ID is passed in as a URL parameter (`extId=`) by the popup
// when it opens the claim tab. Without it we have no idea which extension to
// talk to (chrome doesn't broadcast).

interface MaybeChromeRuntime {
  sendMessage?: (extId: string, msg: unknown, cb?: (resp: unknown) => void) => void;
  lastError?: { message?: string };
}

function getRuntime(): MaybeChromeRuntime | null {
  const w = window as unknown as { chrome?: { runtime?: MaybeChromeRuntime } };
  return w.chrome?.runtime ?? null;
}

async function send(extId: string, msg: unknown): Promise<void> {
  const rt = getRuntime();
  if (!rt?.sendMessage) return;
  await new Promise<void>((resolve) => {
    try {
      rt.sendMessage!(extId, msg, () => {
        // Drain lastError so chrome doesn't log "Unchecked runtime.lastError"
        void rt.lastError;
        resolve();
      });
    } catch {
      resolve();
    }
  });
}

/** Tell the extension that an OCT → wOCT claim landed on Ethereum. */
export async function notifyClaimLanded(extId: string | undefined, bridgeId: string | undefined, claimTxHash: string): Promise<void> {
  if (!extId || !bridgeId) return;
  await send(extId, { kind: 'BRIDGE_MARK_CLAIMED', id: bridgeId, claimTxHash });
}

/** Tell the extension that a wOCT burn confirmed on Ethereum. The OCT-side
 *  unlock by the relayer happens shortly after; we don't track that yet. */
export async function notifyBurnLanded(extId: string | undefined, bridgeId: string | undefined, ethBurnTxHash: string): Promise<void> {
  if (!extId || !bridgeId) return;
  await send(extId, { kind: 'BRIDGE_MARK_UNLOCKED', id: bridgeId, ethBurnTxHash });
}

/** Ask the extension to close THIS tab (and optionally stop the offscreen
 *  music it's playing). Used by the "all done — close" button after a claim
 *  or burn lands. window.close() doesn't work on tabs we didn't open via
 *  window.open(), so we route through the extension which has chrome.tabs. */
export async function closeMyTab(extId: string | undefined, opts: { stopMusic?: boolean } = {}): Promise<boolean> {
  if (!extId) return false;
  const rt = getRuntime();
  if (!rt?.sendMessage) return false;
  return await new Promise<boolean>((resolve) => {
    try {
      rt.sendMessage!(extId, { kind: 'CLOSE_CLAIM_TAB', stopMusic: !!opts.stopMusic }, () => {
        void rt.lastError;
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}
