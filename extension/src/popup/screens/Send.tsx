import { useState } from 'react';
import { send } from '../../lib/messages';
import { parseAmountToRaw } from '../../lib/rpc';
import { isValidAddress } from '../../lib/crypto';

interface Props { onDone: () => void; }

export function Send({ onDone }: Props) {
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okHash, setOkHash] = useState<string | null>(null);

  async function doSend() {
    setErr(null); setOkHash(null);
    if (!isValidAddress(to)) { setErr('invalid recipient address'); return; }
    let amountRaw: string;
    try { amountRaw = parseAmountToRaw(amount); } catch (e) { setErr((e as Error).message || 'invalid amount'); return; }
    if (BigInt(amountRaw) <= 0n) { setErr('amount must be > 0'); return; }
    setBusy(true);
    const r = await send<{ tx_hash?: string }>({ kind: 'SEND_TX', to, amountRaw, message: message || undefined });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setOkHash(r.data.tx_hash ?? '(submitted)');
  }

  return (
    <div className="center">
      <div>
        <label htmlFor="send-to">recipient (oct…)</label>
        <input id="send-to" name="to" value={to} onChange={(e) => setTo(e.target.value.trim())} placeholder="oct…" autoComplete="off" />
      </div>
      <div>
        <label htmlFor="send-amount">amount (OCT)</label>
        <input id="send-amount" name="amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" inputMode="decimal" autoComplete="off" />
      </div>
      <div>
        <label htmlFor="send-message">message (optional)</label>
        <input id="send-message" name="message" value={message} onChange={(e) => setMessage(e.target.value)} autoComplete="off" />
      </div>
      {err && <div className="callout err">{err}</div>}
      {okHash && (
        <div className="callout ok">
          submitted: <span className="mono">{okHash}</span>
        </div>
      )}
      <div className="row">
        <button className="ghost" onClick={onDone}>back</button>
        <button onClick={doSend} disabled={busy || !to || !amount}>{busy ? 'sending…' : 'send'}</button>
      </div>
    </div>
  );
}
