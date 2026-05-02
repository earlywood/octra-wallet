import { useEffect, useState } from 'react';
import {
  getAnnouncedProviders,
  getInjectedProvider,
  onProviderAnnounced,
  requestAccounts,
  requestProviders,
  type Eip1193Provider,
  type Eip6963ProviderDetail,
} from '../lib/eth';

interface Props {
  onConnected: (provider: Eip1193Provider, address: string) => void;
}

export function WalletPicker({ onConnected }: Props) {
  const [providers, setProviders] = useState<Eip6963ProviderDetail[]>(getAnnouncedProviders());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const off = onProviderAnnounced((d) => {
      setProviders((cur) => cur.find((c) => c.info.uuid === d.info.uuid) ? cur : [...cur, d]);
    });
    requestProviders();
    return () => { off(); };
  }, []);

  async function connect(p: Eip1193Provider) {
    setErr(null); setBusy(true);
    try {
      const accts = await requestAccounts(p);
      if (!accts.length) throw new Error('no accounts returned');
      onConnected(p, accts[0]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function connectInjected() {
    const p = getInjectedProvider();
    if (!p) { setErr('no browser wallet detected. install MetaMask, Rabby, or another EIP-1193 wallet.'); return; }
    await connect(p);
  }

  return (
    <div className="card">
      <div style={{ marginBottom: 10 }}><strong>connect your ethereum wallet</strong></div>
      {providers.length > 0 ? (
        <div className="wallet-list">
          {providers.map((d) => (
            <button key={d.info.uuid} onClick={() => connect(d.provider)} disabled={busy}>
              <img src={d.info.icon} alt="" />
              <span>{d.info.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <button onClick={connectInjected} disabled={busy}>
          {busy ? 'connecting…' : 'connect wallet'}
        </button>
      )}
      {err && <div className="callout err" style={{ marginTop: 10 }}>{err}</div>}
      <div className="callout info" style={{ marginTop: 10 }}>
        works with any browser wallet that injects <code>window.ethereum</code> — MetaMask, Rabby, OKX, Coinbase Wallet, Brave.
      </div>
    </div>
  );
}
