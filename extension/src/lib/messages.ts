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
  | { kind: 'SAVE_SETTINGS'; settings: Partial<{ rpcUrl: string; relayerUrl: string; explorerUrl: string; ethRpcUrl: string; claimUrl: string }> }
  | { kind: 'EXPORT_VAULT'; pin: string }
  | { kind: 'WIPE_VAULT' };

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
