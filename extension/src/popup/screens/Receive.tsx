import { useState } from 'react';

interface Props { address: string; }

export function Receive({ address }: Props) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="center">
      <div>
        <label>your address</label>
        <div className="callout mono" style={{ lineHeight: 1.7 }}>{address}</div>
      </div>
      <button onClick={copy}>{copied ? 'copied!' : 'copy address'}</button>
      <div className="status info">
        share this address to receive OCT.
      </div>
    </div>
  );
}
