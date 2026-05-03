interface Props { size?: number }

// In-page logo: re-render the composite as live SVG so we can apply a
// turbulence + displacement filter to the ring stroke for a hand-painted /
// spray-can wobble. The mask half is still the baked PNG (cropped square).
// (Manifest icons + favicons stay as plain PNG via gen-icons.mjs — wobble at
// 16px just looks noisy.)
function iconUrl(): string {
  const cr = (globalThis as { chrome?: { runtime?: { getURL?: (p: string) => string } } }).chrome;
  if (cr?.runtime?.getURL) {
    try { return cr.runtime.getURL('icons/icon128.png'); } catch { /* not in extension */ }
  }
  return `${import.meta.env.BASE_URL}favicon-256.png`;
}

export function Logo({ size = 28 }: Props) {
  const id = `wobble-${Math.round(size)}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ display: 'inline-block', flexShrink: 0 }}>
      <defs>
        <filter id={id} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.025" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="3" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      {/* mask: the baked composite PNG (already has the AC mask inside the
          original blue ring). using it as the inner content keeps the silhouette
          identical to the favicon. */}
      <image href={iconUrl()} x="0" y="0" width="100" height="100" />
      {/* extra wobbled ring on top — slightly thicker / overlapping the baked
          ring — gives the spray-paint roughness without ruining the symbol */}
      <circle cx="50" cy="50" r="42" stroke="#0000DB" strokeWidth="9" fill="none" filter={`url(#${id})`} opacity="0.85" />
    </svg>
  );
}
