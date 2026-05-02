import {
  createNewWallet,
  destroyVault,
  getSession,
  getSettings,
  hasVault,
  importFromMnemonic,
  importFromPrivateKey,
  lockVault,
  readVault,
  saveSettings,
  sessionToSeed,
  unlockVault,
  type UnlockedSession,
} from '../lib/wallet';
import { aesGcmDecrypt } from '../lib/crypto';
import { getNonceAndBalance, getTxsByAddress, submitTx } from '../lib/rpc';
import { buildSendTx, signTx } from '../lib/tx';
import { lockOctToEth } from '../lib/bridge';
import type { Msg, Reply, ReplyErr } from '../lib/messages';

async function requireSession(): Promise<UnlockedSession> {
  const s = await getSession();
  if (!s) throw new Error('locked');
  return s;
}

async function handle(msg: Msg): Promise<Reply | ReplyErr> {
  try {
    switch (msg.kind) {
      case 'STATUS': {
        const [hv, sess, settings] = await Promise.all([hasVault(), getSession(), getSettings()]);
        return { ok: true, data: { hasVault: hv, isUnlocked: !!sess, address: sess?.address ?? null, settings } };
      }
      case 'CREATE_WALLET': {
        const r = await createNewWallet(msg.pin);
        await unlockVault(msg.pin);
        return { ok: true, data: r };
      }
      case 'IMPORT_MNEMONIC': {
        const r = await importFromMnemonic(msg.mnemonic.trim(), msg.pin, msg.hdVersion ?? 2);
        await unlockVault(msg.pin);
        return { ok: true, data: r };
      }
      case 'IMPORT_PRIVKEY': {
        const r = await importFromPrivateKey(msg.privB64, msg.pin);
        await unlockVault(msg.pin);
        return { ok: true, data: r };
      }
      case 'UNLOCK': {
        const s = await unlockVault(msg.pin);
        return { ok: true, data: { address: s.address } };
      }
      case 'LOCK': {
        await lockVault();
        return { ok: true, data: null };
      }
      case 'GET_BALANCE': {
        const s = await requireSession();
        const { rpcUrl } = await getSettings();
        const r = await getNonceAndBalance(rpcUrl, s.address);
        return { ok: true, data: r };
      }
      case 'GET_HISTORY': {
        const s = await requireSession();
        const { rpcUrl } = await getSettings();
        const r = await getTxsByAddress(rpcUrl, s.address, msg.limit ?? 25);
        return r.ok ? { ok: true, data: r.result } : { ok: false, error: r.error };
      }
      case 'SEND_TX': {
        const s = await requireSession();
        const { rpcUrl } = await getSettings();
        const { nonce } = await getNonceAndBalance(rpcUrl, s.address);
        const tx = buildSendTx({ from: s.address, to: msg.to, amountRaw: msg.amountRaw, nonce: nonce + 1, message: msg.message });
        const seed = sessionToSeed(s);
        const signed = signTx(tx, seed, s.publicKeyB64);
        seed.fill(0);
        const r = await submitTx(rpcUrl, signed);
        return r.ok ? { ok: true, data: r.result } : { ok: false, error: r.error };
      }
      case 'BRIDGE_LOCK': {
        const s = await requireSession();
        const { rpcUrl } = await getSettings();
        const seed = sessionToSeed(s);
        const r = await lockOctToEth({
          rpc: rpcUrl,
          from: s.address,
          ethRecipient: msg.ethRecipient,
          amountRaw: msg.amountRaw,
          privSeed32: seed,
          publicKeyB64: s.publicKeyB64,
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
      default:
        return { ok: false, error: `unknown msg: ${(msg as { kind?: string }).kind ?? 'unknown'}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handle(msg as Msg).then(sendResponse);
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  // no-op for now; placeholder for migrations later
});
