export type Msg =
  | { kind: 'STATUS' }
  | { kind: 'CREATE_WALLET'; pin: string }
  | { kind: 'IMPORT_MNEMONIC'; mnemonic: string; pin: string; hdVersion?: 1 | 2 }
  | { kind: 'IMPORT_PRIVKEY'; privB64: string; pin: string }
  | { kind: 'UNLOCK'; pin: string }
  | { kind: 'LOCK' }
  | { kind: 'GET_BALANCE' }
  | { kind: 'GET_HISTORY'; limit?: number }
  | { kind: 'SEND_TX'; to: string; amountRaw: string; message?: string }
  | { kind: 'BRIDGE_LOCK'; ethRecipient: string; amountRaw: string }
  | { kind: 'GET_SETTINGS' }
  | { kind: 'SAVE_SETTINGS'; settings: Partial<{ rpcUrl: string; relayerUrl: string; explorerUrl: string; ethRpcUrl: string; claimUrl: string; musicEnabled: boolean }> }
  | { kind: 'EXPORT_VAULT'; pin: string }
  | { kind: 'WIPE_VAULT' }
  // multi-account ops (vault must be unlocked)
  | { kind: 'LIST_ACCOUNTS' }
  | { kind: 'SET_ACTIVE_ACCOUNT'; id: string }
  | { kind: 'ADD_ACCOUNT_GENERATED'; label?: string }
  | { kind: 'ADD_ACCOUNT_MNEMONIC'; mnemonic: string; label?: string }
  | { kind: 'ADD_ACCOUNT_PRIVKEY'; privB64: string; label?: string }
  | { kind: 'RENAME_ACCOUNT'; id: string; label: string }
  | { kind: 'REMOVE_ACCOUNT'; id: string; pin: string }
  | { kind: 'EXPORT_PRIVATE_KEY'; id: string; pin: string }
  | { kind: 'EXPORT_MNEMONIC'; id: string; pin: string }
  // ambient audio (offscreen document)
  | { kind: 'PLAY_MUSIC'; src?: string; volume?: number; loop?: boolean }
  | { kind: 'STOP_MUSIC' };

export interface Reply<T = unknown> { ok: true; data: T }
export interface ReplyErr { ok: false; error: string }

export async function send<T = unknown>(msg: Msg): Promise<Reply<T> | ReplyErr> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message ?? 'runtime error' });
      else resolve(res ?? { ok: false, error: 'no response' });
    });
  });
}
