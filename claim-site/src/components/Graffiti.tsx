// Graffiti / sticker-bomb overlay. Renders absolutely-positioned spray-paint
// tags + one Milady image per page in the empty space around the main content.
// pointer-events disabled throughout so it never interferes with clicks or
// text selection.

interface MiladyProps { size?: number; opacity?: number; rotate?: number; tint?: 'yellow' | 'red' | 'white'; style?: React.CSSProperties }

// Resolve milady.png across both runtimes:
//  - extension popup → chrome.runtime.getURL (chrome-extension://… origin)
//  - static claim-site → relative URL under vite's BASE_URL
function miladySrc(): string {
  const cr = (globalThis as { chrome?: { runtime?: { getURL?: (p: string) => string } } }).chrome;
  if (cr?.runtime?.getURL) {
    try { return cr.runtime.getURL('milady.png'); } catch { /* not in extension */ }
  }
  return `${import.meta.env.BASE_URL}milady.png`;
}

// One small Milady (anime-eyes silhouette) — uses the actual milady.png,
// much truer to the milady-maker aesthetic than a hand-rolled SVG. Tinted via
// CSS filter so it can pop yellow / red / pure white per page without needing
// multiple image variants.
const TINT_FILTERS = {
  yellow: 'invert(0.85) sepia(1) saturate(6) hue-rotate(0deg) brightness(1.1)',
  red:    'invert(0.5)  sepia(1) saturate(8) hue-rotate(-30deg) brightness(1.05)',
  white:  'invert(1) brightness(1.4) contrast(1.1)',
};

export function Milady({ size = 110, opacity = 0.55, rotate = 0, tint = 'yellow', style }: MiladyProps) {
  return (
    <img
      src={miladySrc()}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      style={{
        position: 'absolute',
        opacity,
        transform: `rotate(${rotate}deg)`,
        pointerEvents: 'none',
        userSelect: 'none',
        filter: TINT_FILTERS[tint],
        mixBlendMode: 'screen',
        ...style,
      }}
    />
  );
}

interface TagProps {
  text: string;
  color?: string;
  size?: number;
  rotate?: number;
  flicker?: boolean;
  style?: React.CSSProperties;
}

// Spray-paint sticker text. Uses Permanent Marker as the primary face (loaded
// from /public/fonts/) with Impact as a fallback while the woff2 fetches.
// Heavy black halo + colored glow simulates the spray ring around the core.
export function Tag({ text, color = '#ffe600', size = 22, rotate = -8, flicker, style }: TagProps) {
  return (
    <span
      aria-hidden="true"
      className={flicker ? 'tag tag-flicker' : 'tag'}
      style={{
        position: 'absolute',
        fontSize: size,
        color,
        textShadow:
          '-1px -1px 0 #000, 2px -1px 0 #000, -1px 2px 0 #000, 2px 2px 0 #000, ' +
          `0 0 14px ${color}66, 0 0 2px #000`,
        transform: `rotate(${rotate}deg)`,
        ['--tag-glow' as string]: `${color}66`,
        ...style,
      }}
    >
      {text}
    </span>
  );
}

// Full-page composition for the claim site. One Milady, eight tags, no
// wagmi, lean cyberpunk-snobbish.
export function ClaimSiteGraffiti() {
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
      <Tag text="chknen nuget"          color="#ffe600" size={42} rotate={-13} style={{ top: '8vh',   left: '4vw' }} />
      <Tag text="india does not forgive" color="#ff1f3a" size={26} rotate={5}   style={{ top: '32vh', right: '3vw' }} />
      <Tag text="ZERO TRUST"            color="#ffe600" size={64} rotate={-3}  style={{ bottom: '14vh', left: '5vw' }} />
      <Tag text="dark forest"           color="#ffe600" size={22} rotate={4}   style={{ top: '64vh', left: '2vw' }} />
      <Tag text="404: REGRET"           color="#ff1f3a" size={36} rotate={-7}  flicker style={{ top: '2vh',  right: '14vw' }} />
      <Tag text="post-FHE depression"   color="#ff1f3a" size={20} rotate={6}   style={{ bottom: '6vh', right: '4vw' }} />
      <Tag text="burn after read"       color="#ffe600" size={26} rotate={11}  style={{ top: '78vh', right: '6vw' }} />
      <Tag text="air-gapped"            color="#ffe600" size={18} rotate={-4}  style={{ top: '92vh', left: '36vw' }} />
      <Tag text="signal // noise"       color="#ff1f3a" size={20} rotate={2}   style={{ top: '48vh', left: '4vw' }} />

      <Milady size={140} opacity={0.45} rotate={-6} tint="white" style={{ top: '18vh', right: '5vw' }} />
    </div>
  );
}

// Tight popup version (360 × ~600). Three small tags + a tiny Milady tucked
// into a corner so the wallet UI stays uncrowded.
export function PopupGraffiti() {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
      <Tag text="zero trust"      color="#ffe600" size={13} rotate={-12} style={{ top: 14, right: 90 }} />
      <Tag text="chknen"          color="#ff1f3a" size={11} rotate={6}   style={{ bottom: 8,  left: 10 }} />
      <Tag text="encrypted btw"   color="#ffe600" size={10} rotate={-4}  flicker style={{ bottom: 8, right: 8 }} />
      <Milady size={62} opacity={0.55} rotate={-8} tint="red" style={{ bottom: 28, right: 12 }} />
    </div>
  );
}
