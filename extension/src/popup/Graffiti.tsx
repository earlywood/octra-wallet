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

// Full-page composition for the claim site. just the milady, no tags.
export function ClaimSiteGraffiti() {
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
      <Milady size={140} opacity={0.45} rotate={-6} tint="white" style={{ top: '18vh', right: '5vw' }} />
    </div>
  );
}

// Tight popup version. Just the Milady — no spray-paint tags, the wallet UI
// stays clean.
export function PopupGraffiti() {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
      <Milady size={62} opacity={0.55} rotate={-8} tint="red" style={{ bottom: 28, right: 12 }} />
    </div>
  );
}
