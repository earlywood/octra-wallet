import { useEffect, useState } from 'react';
import { send } from '../lib/messages';
import { Identicon } from './Identicon';
import { Logo } from './Logo';

export interface AccountSummary { id: string; label: string; address: string }

interface Props {
  active: AccountSummary;
  accounts: AccountSummary[];
  onSwitched: () => void;
  onAdd: () => void;
}

function shortAddr(a: string) { return a.slice(0, 8) + '…' + a.slice(-6); }

export function AccountSwitcher({ active, accounts, onSwitched, onAdd }: Props) {
  const [open, setOpen] = useState(false);

  // close on Escape + click outside
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.account-switcher')) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onClick);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('click', onClick); };
  }, [open]);

  async function pick(id: string) {
    if (id === active.id) { setOpen(false); return; }
    const r = await send({ kind: 'SET_ACTIVE_ACCOUNT', id });
    setOpen(false);
    if (r.ok) onSwitched();
  }

  return (
    <div className="account-switcher" style={{ position: 'relative' }}>
      <button
        className="account-switcher-trigger"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        aria-label="switch account"
        title="switch account"
      >
        <Logo size={26} />
        <span className="chevron">▾</span>
      </button>

      {open && (
        <div className="account-menu">
          <div className="section-label" style={{ padding: '8px 10px 4px' }}>accounts ({accounts.length})</div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {accounts.map((a) => (
              <button
                key={a.id}
                className={`account-row${a.id === active.id ? ' active' : ''}`}
                onClick={() => pick(a.id)}
              >
                <Identicon address={a.address} size={26} ring={a.id === active.id} />
                <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.label}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'ui-monospace, monospace' }}>
                    {shortAddr(a.address)}
                  </div>
                </div>
                {a.id === active.id && <span style={{ fontSize: 10, color: 'var(--ok)' }}>● active</span>}
              </button>
            ))}
          </div>
          <div style={{ borderTop: '1px solid var(--border)', padding: 6 }}>
            <button
              onClick={() => { setOpen(false); onAdd(); }}
              style={{ width: '100%', background: 'transparent', color: 'var(--accent)', textAlign: 'left', fontSize: 12, padding: '8px 10px' }}
            >
              + add account
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
