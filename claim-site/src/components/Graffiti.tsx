// Graffiti / sticker-bomb overlay. Renders absolutely-positioned spray-paint
// tags + chibi eyes in the empty space around the main content. pointer-events
// disabled throughout so it never interferes with clicks or text selection.

interface MiladyEyesProps { size?: number; color?: string; pupilColor?: string }

// Two oversized chibi eyes side-by-side with a tiny highlight in each pupil.
// Inspired by the milady maker eye style — large white sclera, thin outline,
// round pupil, shine dot.
export function MiladyEyes({ size = 70, color = '#0a0e14', pupilColor = '#0a0e14' }: MiladyEyesProps) {
  const w = size;
  const h = size * 0.55;
  return (
    <svg width={w} height={h} viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* eye 1 */}
      <ellipse cx="55" cy="58" rx="45" ry="42" fill="#fff" stroke={color} strokeWidth="6" />
      <circle cx="55" cy="65" r="18" fill={pupilColor} />
      <circle cx="48" cy="55" r="6" fill="#fff" />
      <circle cx="64" cy="74" r="2.5" fill="#fff" opacity="0.8" />
      {/* eye 2 */}
      <ellipse cx="145" cy="58" rx="45" ry="42" fill="#fff" stroke={color} strokeWidth="6" />
      <circle cx="145" cy="65" r="18" fill={pupilColor} />
      <circle cx="138" cy="55" r="6" fill="#fff" />
      <circle cx="154" cy="74" r="2.5" fill="#fff" opacity="0.8" />
    </svg>
  );
}

interface TagProps {
  text: string;
  color?: string;       // text color
  size?: number;        // font-size in px
  rotate?: number;      // degrees
  style?: React.CSSProperties; // additional positioning
}

// Spray-paint sticker text. Heavy shadow simulates the dark spray ring around
// the colored core; tiny blur on top adds the soft halo.
export function Tag({ text, color = '#ffe600', size = 22, rotate = -8, style }: TagProps) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        fontFamily: '"Impact", "Arial Narrow", "Arial Black", sans-serif',
        fontWeight: 900,
        fontSize: size,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color,
        textShadow:
          '-1px -1px 0 #000, 2px -1px 0 #000, -1px 2px 0 #000, 2px 2px 0 #000, ' +
          `0 0 10px ${color}55, 0 0 2px #000`,
        transform: `rotate(${rotate}deg)`,
        userSelect: 'none',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        opacity: 0.92,
        ...style,
      }}
    >
      {text}
    </span>
  );
}

// Cluster of decorations laid out around the page edges. Variants for the
// popup (tight 360px) and claim site (full page) so they sit in the actual
// margins without crowding content.
export function ClaimSiteGraffiti() {
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
      <Tag text="chknen nuget"        color="#ffe600" size={36} rotate={-12} style={{ top: '10vh',   left: '4vw' }} />
      <Tag text="india does not forgive" color="#ff1f3a" size={28} rotate={6}   style={{ top: '34vh',  right: '3vw' }} />
      <Tag text="wagmi"                color="#ffe600" size={56} rotate={-4}  style={{ bottom: '14vh', left: '6vw' }} />
      <Tag text="trust no relayer"     color="#ffe600" size={20} rotate={3}   style={{ top: '62vh',  left: '2vw' }} />
      <Tag text="post-FHE depression"  color="#ff1f3a" size={22} rotate={-6}  style={{ bottom: '8vh',  right: '4vw' }} />
      <Tag text="encrypted btw"        color="#ffe600" size={24} rotate={11}  style={{ top: '78vh',  right: '8vw' }} />
      <Tag text="skill issue"          color="#ff1f3a" size={32} rotate={-9}  style={{ top: '4vh',   right: '12vw' }} />
      <Tag text="no rug pls"           color="#ffe600" size={18} rotate={4}   style={{ top: '88vh',  left: '38vw' }} />

      <span style={{ position: 'absolute', top: '20vh', right: '6vw', opacity: 0.55, transform: 'rotate(-5deg)' }}>
        <MiladyEyes size={88} pupilColor="#ff1f3a" />
      </span>
      <span style={{ position: 'absolute', bottom: '24vh', left: '3vw', opacity: 0.5, transform: 'rotate(8deg)' }}>
        <MiladyEyes size={70} />
      </span>
    </div>
  );
}

export function PopupGraffiti() {
  // Tight 360×~600 popup — keep decorations to non-essential corners only,
  // very small font sizes so they don't scream over the actual UI text.
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
      <Tag text="wagmi"     color="#ffe600" size={14} rotate={-12} style={{ top: 14, right: 90 }} />
      <Tag text="chknen"    color="#ff1f3a" size={11} rotate={6}   style={{ bottom: 8,  left: 10 }} />
      <Tag text="encrypted btw" color="#ffe600" size={9} rotate={-4} style={{ bottom: 8, right: 8 }} />
      <span style={{ position: 'absolute', bottom: 30, right: 12, opacity: 0.45, transform: 'rotate(-6deg)' }}>
        <MiladyEyes size={36} pupilColor="#ff1f3a" />
      </span>
    </div>
  );
}
