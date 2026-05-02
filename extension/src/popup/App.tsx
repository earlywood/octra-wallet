import { useEffect, useState } from 'react';
import { send } from '../lib/messages';
import { Onboarding } from './screens/Onboarding';
import { Unlock } from './screens/Unlock';
import { Home } from './screens/Home';

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

  if (!status.hasVault) return <Onboarding onDone={refresh} />;
  if (!status.isUnlocked) return <Unlock onUnlock={refresh} />;
  return <Home address={status.address!} onLock={refresh} />;
}
