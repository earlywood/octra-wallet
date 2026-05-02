import { useEffect, useRef, useState } from 'react';
import { Steps, type StepDef } from '../components/Steps';
import { WalletPicker } from '../components/WalletPicker';
import { formatRawAmount } from '../lib/bridge';
import { findOurMessage, getClaimCalldata } from '../lib/relayer';
import { pollUntilEpoch, pollUntilHeader, sleep } from '../lib/flow';
import { simulateClaim, submitClaim, waitForReceipt, type Eip1193Provider } from '../lib/eth';

export interface O2EParams {
  lockTx: string;
  amount: string;        // micro-OCT
  recipient: string;     // 0x…
  rpcUrl: string;
  relayerUrl: string;
  explorerUrl: string;
  ethRpcUrl: string;
  bridgeId?: string;
}

type Phase = 'wait_lock' | 'wait_header' | 'connect' | 'ready' | 'sim' | 'submit' | 'wait_claim' | 'done' | 'failed';

export function O2EFlow({ params }: { params: O2EParams }) {
  const [phase, setPhase] = useState<Phase>('wait_lock');
  const [statusMsg, setStatusMsg] = useState('preparing…');
  const [err, setErr] = useState<string | null>(null);
  const [epoch, setEpoch] = useState<number | null>(null);
  const [calldata, setCalldata] = useState<string | null>(null);
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [ethAddr, setEthAddr] = useState<string | null>(null);
  const [claimTx, setClaimTx] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    drive();
    return () => { abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function drive() {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      setPhase('wait_lock');
      setStatusMsg('waiting for OCT lock tx to confirm on octra…');
      const ep = await pollUntilEpoch(params.rpcUrl, params.lockTx, ac.signal);
      setEpoch(ep);

      setPhase('wait_header');
      setStatusMsg('waiting for relayer to publish bridge header on ethereum (~1–2 min)…');
      await pollUntilHeader(params.relayerUrl, ep, ac.signal);
      const myMsg = await findOurMessage(params.relayerUrl, ep, params.recipient);
      if (!myMsg) throw new Error('our message was not found in the bridge epoch');
      const cd = await getClaimCalldata(params.relayerUrl, ep, myMsg.leaf_index);
      if (!cd) throw new Error('relayer did not return claim calldata');
      setCalldata(cd);

      setPhase('connect');
      setStatusMsg('header ready. connect your ethereum wallet to claim.');
    } catch (e) {
      if ((e as Error).message === 'aborted') return;
      setErr((e as Error).message);
      setPhase('failed');
    }
  }

  function onConnected(p: Eip1193Provider, addr: string) {
    setProvider(p);
    setEthAddr(addr);
    setPhase('ready');
  }

  async function doClaim() {
    if (!provider || !ethAddr || !calldata) return;
    setErr(null);
    setPhase('sim');
    setStatusMsg('simulating claim…');
    let sim = await simulateClaim(provider, ethAddr, calldata);
    if (!sim.ok) {
      if (sim.reason === 'replay') { setPhase('done'); setStatusMsg('already claimed on-chain.'); return; }
      if (sim.reason === 'unknown_header') {
        setStatusMsg('header not on ethereum yet. relayer is still submitting. retrying…');
        for (let i = 0; i < 12; i++) {
          await sleep(5000);
          const sim2 = await simulateClaim(provider, ethAddr, calldata);
          if (sim2.ok) { sim = sim2; break; }
          if (i === 11) { setErr('header still not on ethereum after retry. try again later.'); setPhase('ready'); return; }
        }
      } else {
        setErr(`claim sim failed: ${sim.reason} — ${sim.raw}`);
        setPhase('ready');
        return;
      }
    }
    setPhase('submit');
    setStatusMsg('confirm the claim transaction in your wallet…');
    let txHash: string;
    try {
      txHash = await submitClaim(provider, ethAddr, calldata);
    } catch (e) {
      setErr((e as Error).message);
      setPhase('ready');
      return;
    }
    setClaimTx(txHash);
    setPhase('wait_claim');
    setStatusMsg('claim transaction submitted. waiting for confirmation…');
    const r = await waitForReceipt(provider, txHash, 300_000);
    if (!r) { setErr('claim tx not confirmed in 5min. check etherscan.'); setPhase('failed'); return; }
    if (r.status !== '0x1') { setErr('claim tx reverted on-chain.'); setPhase('failed'); return; }
    setPhase('done');
    setStatusMsg('claimed! wOCT is now in your ethereum wallet.');
  }

  const steps: StepDef[] = [
    { id: 'lock',    label: 'OCT lock confirmed on octra',         status: epoch != null ? 'done' : phase === 'wait_lock' ? 'active' : 'pending' },
    { id: 'header',  label: 'relayer publishes bridge header',     status: calldata ? 'done' : phase === 'wait_header' ? 'active' : 'pending' },
    { id: 'connect', label: 'connect ethereum wallet',             status: ethAddr ? 'done' : phase === 'connect' ? 'active' : 'pending' },
    { id: 'claim',   label: 'claim wOCT (eth tx)',                 status: phase === 'sim' || phase === 'submit' || phase === 'wait_claim' ? 'active' : phase === 'done' ? 'done' : phase === 'failed' ? 'failed' : 'pending' },
  ];

  return (
    <div>
      <div className="card">
        <div className="kv"><span className="k">direction</span><span className="v">OCT → wOCT</span></div>
        <div className="kv"><span className="k">amount</span><span className="v">{formatRawAmount(params.amount)} OCT</span></div>
        <div className="kv"><span className="k">eth recipient</span><span className="v">{params.recipient}</span></div>
        <div className="kv"><span className="k">octra lock tx</span><span className="v">
          <a href={`${params.explorerUrl}/tx.html?hash=${params.lockTx}`} target="_blank" rel="noopener noreferrer">{params.lockTx.slice(0, 16)}…</a>
        </span></div>
        {epoch != null && <div className="kv"><span className="k">epoch</span><span className="v">{epoch}</span></div>}
        {claimTx && <div className="kv"><span className="k">claim tx</span><span className="v"><a href={`https://etherscan.io/tx/${claimTx}`} target="_blank" rel="noopener noreferrer">{claimTx.slice(0, 16)}…</a></span></div>}
      </div>

      <div className="card">
        <Steps steps={steps} />
        {statusMsg && <div className="callout info">{statusMsg}</div>}
        {err && <div className="callout err" style={{ marginTop: 10 }}>{err}</div>}
      </div>

      {phase === 'connect' && <WalletPicker onConnected={onConnected} />}

      {phase === 'ready' && (
        <div className="card">
          <div className="kv"><span className="k">connected</span><span className="v">{ethAddr}</span></div>
          <div className="spacer" />
          <button onClick={doClaim}>claim wOCT</button>
        </div>
      )}

      {phase === 'done' && (
        <div className="callout ok">
          done! check your ethereum wallet to confirm wOCT balance.
          {claimTx && <> · <a href={`https://etherscan.io/tx/${claimTx}`} target="_blank" rel="noopener noreferrer">view tx</a></>}
        </div>
      )}

      {phase === 'failed' && (
        <div className="card">
          <button onClick={drive}>retry</button>
        </div>
      )}
    </div>
  );
}
