import { useState } from 'react';
import { send } from '../../lib/messages';

interface Props { onDone: () => void; }

type Mode = 'choose' | 'create' | 'create-show' | 'import-mnemonic' | 'import-priv';

export function Onboarding({ onDone }: Props) {
  const [mode, setMode] = useState<Mode>('choose');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [priv, setPriv] = useState('');
  const [createdMnemonic, setCreatedMnemonic] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function validatePin(): string | null {
    if (pin.length < 4) return 'PIN must be at least 4 characters';
    if (pin !== pin2) return 'PINs do not match';
    return null;
  }

  async function doCreate() {
    setErr(null);
    const v = validatePin();
    if (v) { setErr(v); return; }
    setBusy(true);
    const r = await send<{ address: string; mnemonic: string }>({ kind: 'CREATE_WALLET', pin });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setCreatedMnemonic(r.data.mnemonic);
    setMode('create-show');
  }

  async function doImportMnemonic() {
    setErr(null);
    const v = validatePin();
    if (v) { setErr(v); return; }
    setBusy(true);
    const r = await send<{ address: string }>({ kind: 'IMPORT_MNEMONIC', mnemonic, pin });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onDone();
  }

  async function doImportPriv() {
    setErr(null);
    const v = validatePin();
    if (v) { setErr(v); return; }
    setBusy(true);
    const r = await send<{ address: string }>({ kind: 'IMPORT_PRIVKEY', privB64: priv, pin });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onDone();
  }

  return (
    <div className="app">
      <div className="topbar"><span className="brand">octra wallet</span></div>
      <div className="content center">
        {mode === 'choose' && (
          <>
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>welcome</div>
              <div className="status info">create a new wallet, or import an existing one</div>
            </div>
            <button onClick={() => setMode('create')}>create new wallet</button>
            <button className="ghost" onClick={() => setMode('import-mnemonic')}>import seed phrase</button>
            <button className="ghost" onClick={() => setMode('import-priv')}>import private key</button>
          </>
        )}

        {(mode === 'create' || mode === 'import-mnemonic' || mode === 'import-priv') && (
          <>
            <div>
              <label>PIN</label>
              <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus />
            </div>
            <div>
              <label>confirm PIN</label>
              <input type="password" value={pin2} onChange={(e) => setPin2(e.target.value)} />
            </div>

            {mode === 'import-mnemonic' && (
              <div>
                <label>seed phrase (12/15/18/21/24 words)</label>
                <textarea value={mnemonic} onChange={(e) => setMnemonic(e.target.value)} />
              </div>
            )}
            {mode === 'import-priv' && (
              <div>
                <label>private key (base64, 32 or 64 bytes)</label>
                <textarea value={priv} onChange={(e) => setPriv(e.target.value)} />
              </div>
            )}

            {err && <div className="callout err">{err}</div>}
            <div className="row">
              <button className="ghost" onClick={() => { setErr(null); setMode('choose'); }}>back</button>
              {mode === 'create' && <button onClick={doCreate} disabled={busy}>create</button>}
              {mode === 'import-mnemonic' && <button onClick={doImportMnemonic} disabled={busy}>import</button>}
              {mode === 'import-priv' && <button onClick={doImportPriv} disabled={busy}>import</button>}
            </div>
          </>
        )}

        {mode === 'create-show' && createdMnemonic && (
          <>
            <div className="callout warn">
              write down these 12 words. anyone with this phrase controls your wallet.
            </div>
            <div className="callout mono" style={{ lineHeight: 1.7 }}>{createdMnemonic}</div>
            <button onClick={onDone}>I saved it — open wallet</button>
          </>
        )}
      </div>
    </div>
  );
}
