import { O2EFlow, type O2EParams } from './flows/O2EFlow';
import { E2OFlow, type E2OParams } from './flows/E2OFlow';
import { DEFAULT_ETH_RPC, DEFAULT_OCTRA_EXPLORER, DEFAULT_OCTRA_RPC, DEFAULT_RELAYER } from './lib/bridge';

function readParams() {
  const u = new URL(window.location.href);
  return {
    dir: u.searchParams.get('dir') ?? 'o2e',
    id: u.searchParams.get('id') ?? undefined,
    lockTx: u.searchParams.get('lockTx') ?? '',
    amount: u.searchParams.get('amount') ?? '',
    recipient: u.searchParams.get('recipient') ?? '',
    octraRecipient: u.searchParams.get('octraRecipient') ?? '',
    rpcUrl: u.searchParams.get('rpc') ?? DEFAULT_OCTRA_RPC,
    relayerUrl: u.searchParams.get('relayer') ?? DEFAULT_RELAYER,
    explorerUrl: u.searchParams.get('explorer') ?? DEFAULT_OCTRA_EXPLORER,
    ethRpcUrl: u.searchParams.get('ethRpc') ?? DEFAULT_ETH_RPC,
  };
}

export function App() {
  const p = readParams();

  if (p.dir === 'o2e') {
    if (!p.lockTx || !p.amount || !p.recipient) {
      return (
        <div className="shell">
          <div className="brand">octra bridge</div>
          <div className="tagline">claim wOCT after locking OCT</div>
          <div className="card">
            <div className="callout warn">
              missing parameters. this page is opened by the Octra Wallet extension after a lock — start your bridge from the extension.
            </div>
          </div>
        </div>
      );
    }
    const params: O2EParams = {
      lockTx: p.lockTx,
      amount: p.amount,
      recipient: p.recipient,
      rpcUrl: p.rpcUrl,
      relayerUrl: p.relayerUrl,
      explorerUrl: p.explorerUrl,
      ethRpcUrl: p.ethRpcUrl,
      bridgeId: p.id,
    };
    return (
      <div className="shell">
        <div className="brand">octra bridge</div>
        <div className="tagline">claim wOCT after locking OCT</div>
        <O2EFlow params={params} />
      </div>
    );
  }

  // wOCT → OCT
  const params: E2OParams = {
    rpcUrl: p.rpcUrl,
    ethRpcUrl: p.ethRpcUrl,
    octraRecipient: p.octraRecipient,
    suggestedAmount: p.amount || undefined,
  };
  return (
    <div className="shell">
      <div className="brand">octra bridge</div>
      <div className="tagline">burn wOCT to unlock OCT</div>
      <E2OFlow params={params} />
    </div>
  );
}
