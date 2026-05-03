import { useState } from 'react';
import { send } from '../../lib/messages';

interface Props { onDone: () => void; onCancel: () => void; }

type Mode = 'choose' | 'generate' | 'import-mnemonic' | 'import-priv' | 'show-mnemonic';

export function AddAccount({ onDone, onCancel }: Props) {
  const [mode, setMode] = useState<Mode>('choose');
  const [label, setLabel] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [priv, setPriv] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shownMnemonic, setShownMnemonic] = useState<string | null>(null);

  async function doGenerate() {
    setErr(null); setBusy(true);
    const r = await send<{ account: { address: string }; mnemonic?: string }>({
      kind: 'ADD_ACCOUNT_GENERATED',
      label: label.trim() || undefined,
    });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    if (r.data.mnemonic) {
      // we just bootstrapped a new master mnemonic — must show it once
      setShownMnemonic(r.data.mnemonic);
      setMode('show-mnemonic');
    } else {
      onDone();
    }
  }

  async function doImportMnemonic() {
    setErr(null); setBusy(true);
    const r = await send({ kind: 'ADD_ACCOUNT_MNEMONIC', mnemonic: mnemonic.trim(), label: label.trim() || undefined });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onDone();
  }

  async function doImportPriv() {
    setErr(null); setBusy(true);
    const r = await send({ kind: 'ADD_ACCOUNT_PRIVKEY', privB64: priv.trim(), label: label.trim() || undefined });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onDone();
  }

  return (
    <div className="content center">
      <div style={{ fontFamily: '"Impact", "Arial Black", sans-serif', fontSize: 16, fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase', textAlign: 'center', padding: '4px 0 6px' }}>
        add account
      </div>

      {mode === 'choose' && (
        <>
          <button onClick={() => setMode('generate')}>generate new account</button>
          <button className="ghost" onClick={() => setMode('import-mnemonic')}>import seed phrase</button>
          <button className="ghost" onClick={() => setMode('import-priv')}>import private key</button>
          <hr />
          <button className="ghost" onClick={onCancel}>cancel</button>
        </>
      )}

      {(mode === 'generate' || mode === 'import-mnemonic' || mode === 'import-priv') && (
        <>
          <div>
            <label htmlFor="add-label">label (optional)</label>
            <input
              id="add-label"
              name="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. trading, savings…"
              autoComplete="off"
              maxLength={40}
            />
          </div>

          {mode === 'import-mnemonic' && (
            <div>
              <label htmlFor="add-mnemonic">seed phrase</label>
              <textarea id="add-mnemonic" autoComplete="off" spellCheck={false} value={mnemonic} onChange={(e) => setMnemonic(e.target.value)} />
            </div>
          )}
          {mode === 'import-priv' && (
            <div>
              <label htmlFor="add-priv">private key (base64, 32 or 64 bytes)</label>
              <textarea id="add-priv" autoComplete="off" spellCheck={false} value={priv} onChange={(e) => setPriv(e.target.value)} />
            </div>
          )}
          {mode === 'generate' && (
            <div className="callout" style={{ fontSize: 11 }}>
              generates the next address derived from your existing seed phrase — no new backup needed.
            </div>
          )}

          {err && <div className="callout err">{err}</div>}
          <div className="row">
            <button className="ghost" onClick={() => { setMode('choose'); setErr(null); }}>back</button>
            {mode === 'generate' && <button onClick={doGenerate} disabled={busy}>{busy ? '…' : 'generate'}</button>}
            {mode === 'import-mnemonic' && <button onClick={doImportMnemonic} disabled={busy || !mnemonic.trim()}>{busy ? '…' : 'import'}</button>}
            {mode === 'import-priv' && <button onClick={doImportPriv} disabled={busy || !priv.trim()}>{busy ? '…' : 'import'}</button>}
          </div>
        </>
      )}

      {mode === 'show-mnemonic' && shownMnemonic && (
        <>
          <div className="callout warn">
            this is a brand-new seed phrase. write down these 12 words — anyone with them controls every HD account derived from your wallet.
          </div>
          <div className="callout mono" style={{ lineHeight: 1.7 }}>{shownMnemonic}</div>
          <button onClick={onDone}>I saved it — done</button>
        </>
      )}
    </div>
  );
}
