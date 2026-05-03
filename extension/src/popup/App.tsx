import { useEffect, useState } from 'react';
import { send } from '../lib/messages';
import { Onboarding } from './screens/Onboarding';
import { Unlock } from './screens/Unlock';
import { Home } from './screens/Home';
import { PopupGraffiti } from './Graffiti';

interface Status {
  hasVault: boolean;
  isUnlocked: boolean;
  address: string | null;
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
  else if (!status.isUnlocked) inner = <Unlock onUnlock={refresh} />;
  else inner = <Home address={status.address!} onLock={refresh} />;

  return (
    <>
      <PopupGraffiti />
      {inner}
    </>
  );
}
