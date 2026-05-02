import { useState } from 'react';
import { Steps, type StepDef } from '../components/Steps';
import { WalletPicker } from '../components/WalletPicker';
import { formatRawAmount, octToWei, parseAmountToRaw, weiToMicroOct } from '../lib/bridge';
import { approveWoct, burnWoct, getWoctBalance, waitForReceipt, type Eip1193Provider } from '../lib/eth';
import { DEFAULT_OCTRA_EXPLORER } from '../lib/bridge';

export interface E2OParams {
  rpcUrl: string;
  ethRpcUrl: string;
  octraRecipient?: string;
  suggestedAmount?: string; // micro-OCT
}

type Phase = 'connect' | 'setup' | 'approving' | 'burning' | 'done' | 'failed';

export function E2OFlow({ params }: { params: E2OParams }) {
  const [phase, setPhase] = useState<Phase>('connect');
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [ethAddr, setEthAddr] = useState<string | null>(null);
  const [woctBal, setWoctBal] = useState<bigint | null>(null);
  const [amount, setAmount] = useState(params.suggestedAmount ? formatRawAmount(params.suggestedAmount) : '');
  const [octRecip, setOctRecip] = useState(params.octraRecipient ?? '');
  const [statusMsg, setStatusMsg] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [approveTx, setApproveTx] = useState<string | null>(null);
  const [burnTx, setBurnTx] = useState<string | null>(null);

  function onConnected(p: Eip1193Provider, addr: string) {
    setProvider(p);
    setEthAddr(addr);
    setPhase('setup');
    getWoctBalance(p, addr).then(setWoctBal).catch(() => {});
  }

  async function start() {
    setErr(null);
    if (!provider || !ethAddr) return;
    if (octRecip.length !== 47 || !octRecip.startsWith('oct')) { setErr('invalid octra recipient'); return; }
    let amountMicro: string;
    try { amountMicro = parseAmountToRaw(amount); } catch { setErr('invalid amount'); return; }
    if (BigInt(amountMicro) <= 0n) { setErr('amount must be > 0'); return; }
    const amountWei = octToWei(amountMicro);
    if (woctBal != null && amountWei > woctBal) { setErr('insufficient wOCT balance'); return; }

    try {
      setPhase('approving');
      setStatusMsg('confirm the wOCT spend approval in your wallet…');
      const aTx = await approveWoct(provider, ethAddr, amountWei);
      setApproveTx(aTx);
      setStatusMsg('waiting for approve tx to confirm…');
      const ar = await waitForReceipt(provider, aTx, 300_000);
      if (!ar || ar.status !== '0x1') throw new Error('approve tx failed or dropped');

      setPhase('burning');
      setStatusMsg('confirm the burn transaction in your wallet…');
      const bTx = await burnWoct(provider, ethAddr, amountWei, octRecip);
      setBurnTx(bTx);
      setStatusMsg('waiting for burn tx to confirm…');
      const br = await waitForReceipt(provider, bTx, 300_000);
      if (!br || br.status !== '0x1') throw new Error('burn tx failed or dropped');

      setPhase('done');
      setStatusMsg('burn confirmed. the relayer auto-unlocks OCT on octra in ~1–2 min — check your octra wallet to confirm receipt.');
    } catch (e) {
      setErr((e as Error).message);
      setPhase('failed');
    }
  }

  const steps: StepDef[] = [
    { id: 'connect', label: 'connect ethereum wallet', status: ethAddr ? 'done' : 'active' },
    { id: 'approve', label: 'approve wOCT spend',     status: approveTx ? 'done' : phase === 'approving' ? 'active' : 'pending' },
    { id: 'burn',    label: 'burn wOCT',              status: burnTx ? 'done' : phase === 'burning' ? 'active' : 'pending' },
    { id: 'unlock',  label: 'relayer unlocks OCT (automatic)', status: phase === 'done' ? 'done' : phase === 'failed' ? 'failed' : burnTx ? 'active' : 'pending' },
  ];

  return (
    <div>
      <div className="card">
        <div className="kv"><span className="k">direction</span><span className="v">wOCT → OCT</span></div>
        {ethAddr && <div className="kv"><span className="k">eth wallet</span><span className="v">{ethAddr}</span></div>}
        {woctBal != null && <div className="kv"><span className="k">wOCT balance</span><span className="v">{formatRawAmount(String(weiToMicroOct(woctBal)))} wOCT</span></div>}
        {approveTx && <div className="kv"><span className="k">approve tx</span><span className="v"><a href={`https://etherscan.io/tx/${approveTx}`} target="_blank" rel="noopener noreferrer">{approveTx.slice(0, 16)}…</a></span></div>}
        {burnTx && <div className="kv"><span className="k">burn tx</span><span className="v"><a href={`https://etherscan.io/tx/${burnTx}`} target="_blank" rel="noopener noreferrer">{burnTx.slice(0, 16)}…</a></span></div>}
      </div>

      {phase === 'connect' && <WalletPicker onConnected={onConnected} />}

      {phase === 'setup' && (
        <div className="card">
          <div>
            <label>amount (OCT)</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" inputMode="decimal" />
          </div>
          <div className="spacer" />
          <div>
            <label>octra recipient (oct…)</label>
            <input value={octRecip} onChange={(e) => setOctRecip(e.target.value.trim())} placeholder="oct…" />
          </div>
          <div className="spacer" />
          {err && <div className="callout err" style={{ marginBottom: 10 }}>{err}</div>}
          <button onClick={start} disabled={!amount || !octRecip}>start bridge</button>
        </div>
      )}

      {(phase === 'approving' || phase === 'burning' || phase === 'done' || phase === 'failed') && (
        <div className="card">
          <Steps steps={steps} />
          {statusMsg && <div className="callout info">{statusMsg}</div>}
          {phase === 'done' && octRecip && (
            <div className="callout ok" style={{ marginTop: 10 }}>
              <a href={`${DEFAULT_OCTRA_EXPLORER}/address.html?addr=${octRecip}`} target="_blank" rel="noopener noreferrer">
                view {octRecip.slice(0, 12)}… on octrascan →
              </a>
            </div>
          )}
          {err && <div className="callout err" style={{ marginTop: 10 }}>{err}</div>}
          {phase === 'failed' && <button onClick={start} style={{ marginTop: 10 }}>retry</button>}
        </div>
      )}
    </div>
  );
}
