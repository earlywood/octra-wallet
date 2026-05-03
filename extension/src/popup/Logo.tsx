interface Props { size?: number }

// In-page logo: SVG wrapper around the baked composite PNG, with a turbulence
// + displacement filter applied to an overlapping blue ring for that spray-
// paint wobble. Manifest icons stay clean PNG (wobble at 16px just looks like
// noise); only the in-popup logo is wobbled.
function iconUrl(): string {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL('icons/icon128.png');
  }
  return '/icons/icon128.png';
}

export function Logo({ size = 22 }: Props) {
  const id = `wobble-${Math.round(size)}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ display: 'inline-block', flexShrink: 0 }}>
      <defs>
        <filter id={id} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.025" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="3" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <image href={iconUrl()} x="0" y="0" width="100" height="100" />
      <circle cx="50" cy="50" r="42" stroke="#0000DB" strokeWidth="9" fill="none" filter={`url(#${id})`} opacity="0.85" />
    </svg>
  );
}
