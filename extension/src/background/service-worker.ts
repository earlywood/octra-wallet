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
import type { Msg, Reply, ReplyErr } from '../lib/messages';

async function requireUnlocked(): Promise<{ address: string; publicKeyB64: string; privSeed32B64: string }> {
  if (!(await getSession())) throw new Error('locked');
  return await getActiveAccountSeed();
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
