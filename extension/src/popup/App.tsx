import { useEffect, useState } from 'react';
import { send } from '../lib/messages';
import { Onboarding } from './screens/Onboarding';
import { Unlock } from './screens/Unlock';
import { Home } from './screens/Home';
import { PopupGraffiti } from './Graffiti';

interface AccountSummary { id: string; label: string; address: string }
interface Status {
  hasVault: boolean;
  isUnlocked: boolean;
  address: string | null;
  activeAccount: AccountSummary | null;
  accounts: AccountSummary[];
}

export function App() {
  const [status, setStatus] = useState<Status | null>(null);

  async function refresh() {
    const r = await send<Status>({ kind: 'STATUS' });
    if (r.ok) setStatus(r.data);
  }

  useEffect(() => { refresh(); }, []);

  if (!status) return <div className="app"><div className="content">loading...</div></div>;

  let inner;
  if (!status.hasVault) inner = <Onboarding onDone={refresh} />;
  else if (!status.isUnlocked || !status.activeAccount) inner = <Unlock onUnlock={refresh} />;
  else inner = <Home active={status.activeAccount} accounts={status.accounts} onLock={refresh} onAccountChanged={refresh} />;

  return (
    <>
      <PopupGraffiti />
      {inner}
    </>
  );
}
