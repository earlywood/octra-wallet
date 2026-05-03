import { sha256 } from '@noble/hashes/sha2';

// Tiny deterministic gradient avatar — phantom/rabby style. Two HSL hues
// derived from a sha256 of the address + a third dot for accent.
function colorsFor(addr: string): { a: string; b: string; dot: string } {
  const h = sha256(new TextEncoder().encode(addr));
  const ha = (h[0] + h[1]) % 360;
  const hb = (h[2] + h[3] + 80) % 360;
  const hd = (h[4] + h[5] + 200) % 360;
  return {
    a: `hsl(${ha}, 70%, 55%)`,
    b: `hsl(${hb}, 65%, 45%)`,
    dot: `hsl(${hd}, 80%, 60%)`,
  };
}

interface Props { address: string; size?: number; ring?: boolean }

export function Identicon({ address, size = 22, ring = false }: Props) {
  const c = colorsFor(address || 'oct');
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ display: 'inline-block', flexShrink: 0, borderRadius: '50%' }}>
      <defs>
        <linearGradient id={`g-${address.slice(3, 9)}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={c.a} />
          <stop offset="100%" stopColor={c.b} />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="11.5" fill={`url(#g-${address.slice(3, 9)})`} stroke={ring ? '#fff' : 'transparent'} strokeWidth={ring ? 0.5 : 0} />
      <circle cx="16" cy="8" r="2.5" fill={c.dot} opacity="0.85" />
    </svg>
  );
}
