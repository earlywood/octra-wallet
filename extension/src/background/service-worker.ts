import {
  addGeneratedAccount,
  addImportedMnemonicAccount,
  addImportedPrivateKeyAccount,
  createInitialWallet,
  destroyVault,
  exportMnemonic,
  exportPrivateKey,
  getActiveAccountSeed,
  getSession,
  getSettings,
  hasVault,
  importInitialFromMnemonic,
  importInitialFromPrivateKey,
  listAccountsPublic,
  lockVault,
  readVault,
  removeAccount,
  renameAccount,
  saveSettings,
  sessionToSeed,
  setActiveAccount,
  unlockVault,
} from '../lib/wallet';
import { aesGcmDecrypt } from '../lib/crypto';
import { getNonceAndBalance, getTxsByAddress, submitTx } from '../lib/rpc';
import { buildSendTx, signTx } from '../lib/tx';
import { lockOctToEth } from '../lib/bridge';
import { patchBridge } from '../lib/bridgeStore';
import type { Msg, Reply, ReplyErr } from '../lib/messages';

async function requireUnlocked(): Promise<{ address: string; publicKeyB64: string; privSeed32B64: string }> {
  if (!(await getSession())) throw new Error('locked');
  return await getActiveAccountSeed();
}

// ---------- offscreen audio host ----------
// MV3 only allows ONE offscreen document per extension; we tear down + recreate
// to be safe across upgrades. AUDIO_PLAYBACK is a sanctioned reason — chrome
// docs explicitly call this out as a use case for the offscreen API.
const OFFSCREEN_PATH = 'src/offscreen/index.html';

async function ensureOffscreen(): Promise<void> {
  // hasDocument exists in Chrome 116+. Older Chrome on MV3: catch and retry.
  try {
    if (await chrome.offscreen.hasDocument?.()) return;
  } catch { /* fall through */ }
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: 'play background music while user runs the bridge claim flow',
    });
  } catch (e) {
    // 'Only a single offscreen document may be created' — race; ignore
    if (!String(e).includes('single offscreen')) throw e;
  }
}

async function closeOffscreen(): Promise<void> {
  try {
    if (await chrome.offscreen.hasDocument?.()) await chrome.offscreen.closeDocument();
  } catch { /* nothing to close */ }
}

async function handle(msg: Msg): Promise<Reply | ReplyErr> {
  try {
    switch (msg.kind) {
      case 'STATUS': {
        const [hv, sess, settings] = await Promise.all([hasVault(), getSession(), getSettings()]);
        let activeAccount: { id: string; label: string; address: string } | null = null;
        let accounts: Array<{ id: string; label: string; address: string }> = [];
        if (sess) {
          const list = await listAccountsPublic();
          accounts = list.accounts.map((a) => ({ id: a.id, label: a.label, address: a.address }));
          const active = list.accounts.find((a) => a.id === list.activeAccountId);
          if (active) activeAccount = { id: active.id, label: active.label, address: active.address };
        }
        return {
          ok: true,
          data: {
            hasVault: hv,
            isUnlocked: !!sess,
            address: activeAccount?.address ?? null,
            activeAccount,
            accounts,
            settings,
          },
        };
      }
      case 'CREATE_WALLET': {
        const r = await createInitialWallet(msg.pin);
        return { ok: true, data: r };
      }
      case 'IMPORT_MNEMONIC': {
        const r = await importInitialFromMnemonic(msg.mnemonic.trim(), msg.pin, msg.hdVersion ?? 2);
        return { ok: true, data: r };
      }
      case 'IMPORT_PRIVKEY': {
        const r = await importInitialFromPrivateKey(msg.privB64, msg.pin);
        return { ok: true, data: r };
      }
      case 'UNLOCK': {
        const r = await unlockVault(msg.pin);
        return { ok: true, data: { address: r.activeAccount.address, accounts: r.accounts } };
      }
      case 'LOCK': {
        await lockVault();
        return { ok: true, data: null };
      }

      case 'LIST_ACCOUNTS': {
        const r = await listAccountsPublic();
        return { ok: true, data: r };
      }
      case 'SET_ACTIVE_ACCOUNT': {
        const r = await setActiveAccount(msg.id);
        return { ok: true, data: r };
      }
      case 'ADD_ACCOUNT_GENERATED': {
        const r = await addGeneratedAccount(msg.label);
        return { ok: true, data: r };
      }
      case 'ADD_ACCOUNT_MNEMONIC': {
        const r = await addImportedMnemonicAccount(msg.mnemonic.trim(), msg.label);
        return { ok: true, data: r };
      }
      case 'ADD_ACCOUNT_PRIVKEY': {
        const r = await addImportedPrivateKeyAccount(msg.privB64, msg.label);
        return { ok: true, data: r };
      }
      case 'RENAME_ACCOUNT': {
        const r = await renameAccount(msg.id, msg.label);
        return { ok: true, data: r };
      }
      case 'REMOVE_ACCOUNT': {
        const r = await removeAccount(msg.id, msg.pin);
        return { ok: true, data: r };
      }
      case 'EXPORT_PRIVATE_KEY': {
        const r = await exportPrivateKey(msg.id, msg.pin);
        return { ok: true, data: r };
      }
      case 'EXPORT_MNEMONIC': {
        const r = await exportMnemonic(msg.id, msg.pin);
        return { ok: true, data: r };
      }

      case 'GET_BALANCE': {
        const acc = await requireUnlocked();
        const { rpcUrl } = await getSettings();
        const r = await getNonceAndBalance(rpcUrl, acc.address);
        return { ok: true, data: r };
      }
      case 'GET_HISTORY': {
        const acc = await requireUnlocked();
        const { rpcUrl } = await getSettings();
        const r = await getTxsByAddress(rpcUrl, acc.address, msg.limit ?? 25);
        return r.ok ? { ok: true, data: r.result } : { ok: false, error: r.error };
      }
      case 'SEND_TX': {
        const acc = await requireUnlocked();
        const { rpcUrl } = await getSettings();
        const { nonce } = await getNonceAndBalance(rpcUrl, acc.address);
        const tx = buildSendTx({ from: acc.address, to: msg.to, amountRaw: msg.amountRaw, nonce: nonce + 1, message: msg.message });
        const seed = sessionToSeed(acc);
        const signed = signTx(tx, seed, acc.publicKeyB64);
        seed.fill(0);
        const r = await submitTx(rpcUrl, signed);
        return r.ok ? { ok: true, data: r.result } : { ok: false, error: r.error };
      }
      case 'BRIDGE_LOCK': {
        const acc = await requireUnlocked();
        const { rpcUrl } = await getSettings();
        const seed = sessionToSeed(acc);
        const r = await lockOctToEth({
          rpc: rpcUrl,
          from: acc.address,
          ethRecipient: msg.ethRecipient,
          amountRaw: msg.amountRaw,
          privSeed32: seed,
          publicKeyB64: acc.publicKeyB64,
        });
        seed.fill(0);
        return r.ok ? { ok: true, data: { tx_hash: r.tx_hash } } : { ok: false, error: r.error ?? 'lock failed' };
      }
      case 'GET_SETTINGS': {
        return { ok: true, data: await getSettings() };
      }
      case 'SAVE_SETTINGS': {
        return { ok: true, data: await saveSettings(msg.settings) };
      }
      case 'EXPORT_VAULT': {
        const blob = await readVault();
        if (!blob) return { ok: false, error: 'no vault' };
        try {
          const json = await aesGcmDecrypt(blob.ciphertextB64, msg.pin);
          return { ok: true, data: JSON.parse(json) };
        } catch {
          return { ok: false, error: 'wrong PIN' };
        }
      }
      case 'WIPE_VAULT': {
        await destroyVault();
        return { ok: true, data: null };
      }

      case 'PLAY_MUSIC': {
        await ensureOffscreen();
        const src = msg.src ?? chrome.runtime.getURL('punjabi.mp3');
        await chrome.runtime.sendMessage({
          target: 'offscreen',
          kind: 'PLAY',
          src,
          volume: msg.volume ?? 0.55,
          loop: !!msg.loop,
        });
        return { ok: true, data: null };
      }
      case 'STOP_MUSIC': {
        try { await chrome.runtime.sendMessage({ target: 'offscreen', kind: 'STOP' }); } catch { /* no doc */ }
        await closeOffscreen();
        return { ok: true, data: null };
      }

      case 'BRIDGE_MARK_CLAIMED': {
        // Direct signal from the claim site after a successful eth claim.
        // Skips the recovery.json poll wait so the popup history flips to
        // 'claimed' immediately. No-op if the entry was already removed/marked.
        const updated = await patchBridge(msg.id, { status: 'claimed', claimTxHash: msg.claimTxHash });
        return { ok: true, data: updated };
      }
      case 'BRIDGE_MARK_UNLOCKED': {
        // Same idea for the e2o flow's burn confirmation. The relayer's
        // OCT-side unlock that follows is harder to detect from the popup;
        // this at least shows the user's burn has landed.
        const updated = await patchBridge(msg.id, { status: 'burn_confirmed', ethBurnTxHash: msg.ethBurnTxHash });
        return { ok: true, data: updated };
      }
      case 'CLOSE_CLAIM_TAB': {
        // Handled in the onMessageExternal listener directly so we have
        // access to sender.tab.id. Returning here is the no-op fallback for
        // the (unexpected) internal-call case.
        return { ok: true, data: null };
      }

      default:
        return { ok: false, error: `unknown msg: ${(msg as { kind?: string }).kind ?? 'unknown'}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // offscreen-targeted messages are routed by the offscreen doc, not us
  if (msg && (msg as { target?: string }).target === 'offscreen') return false;
  // self-cleanup signal from the offscreen audio when a song ends naturally
  if (msg && (msg as { kind?: string }).kind === 'OFFSCREEN_AUDIO_DONE') {
    void closeOffscreen();
    return false;
  }
  handle(msg as Msg).then(sendResponse);
  return true;
});

// External messages — only accepted from the origins listed in manifest's
// `externally_connectable.matches`. The claim site uses this to push a
// "claim landed" / "burn landed" signal so the popup updates instantly.
// Allow-list which message kinds can come in this way; do NOT just forward
// arbitrary Msg, since the external origin shouldn't be able to e.g. send
// a SEND_TX or unlock messages.
const EXTERNAL_KINDS = new Set(['BRIDGE_MARK_CLAIMED', 'BRIDGE_MARK_UNLOCKED', 'CLOSE_CLAIM_TAB']);
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  const kind = (msg as { kind?: string })?.kind;
  if (!kind || !EXTERNAL_KINDS.has(kind)) {
    sendResponse({ ok: false, error: 'kind not permitted from external origin' });
    return false;
  }
  // CLOSE_CLAIM_TAB is special — it needs sender.tab.id to know what tab to
  // close, so we handle it inline rather than routing through handle().
  if (kind === 'CLOSE_CLAIM_TAB') {
    void (async () => {
      const stopMusic = (msg as { stopMusic?: boolean }).stopMusic;
      if (stopMusic) {
        try { await chrome.runtime.sendMessage({ target: 'offscreen', kind: 'STOP' }); } catch { /* no doc */ }
        await closeOffscreen();
      }
      const tabId = sender.tab?.id;
      if (tabId != null) {
        try { await chrome.tabs.remove(tabId); } catch { /* tab already gone */ }
      }
      sendResponse({ ok: true, data: null });
    })();
    return true;
  }
  handle(msg as Msg).then(sendResponse);
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  // no-op for now; placeholder for migrations later
});
