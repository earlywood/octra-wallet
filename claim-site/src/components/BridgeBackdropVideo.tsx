import { useEffect, useRef, useState } from 'react';

interface Props { videoId?: string }

// YouTube backdrop for the o2e claim flow. Notes on autoplay:
//
//  - Modern browsers (Chrome/Firefox/Safari) all block AUDIO autoplay until the
//    user has interacted with the page. There is no workaround. We autoplay
//    MUTED and then unmute on the first user interaction anywhere on the page.
//  - youtube-nocookie.com is a privacy-respecting embed that doesn't set
//    tracking cookies until the user actually engages.
//  - The IFrame Player API postMessage commands are the standard way to
//    control an embedded player from JS without loading the YT JS SDK.
//
// The iframe is sized to cover the viewport (16:9 letterbox eliminated by
// scaling whichever dimension is bigger). It sits at z-index 0 with
// pointer-events: none so it never intercepts clicks; the .shell content sits
// at z-index 1 above it.
export function BridgeBackdropVideo({ videoId = 'x9WO2ieJMYk' }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [muted, setMuted] = useState(true);

  // unmute on first user interaction
  useEffect(() => {
    if (!muted) return;
    const unmute = () => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      win.postMessage('{"event":"command","func":"unMute","args":""}', '*');
      win.postMessage('{"event":"command","func":"setVolume","args":[55]}', '*');
      setMuted(false);
    };
    window.addEventListener('pointerdown', unmute, { once: true });
    window.addEventListener('keydown', unmute, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unmute);
      window.removeEventListener('keydown', unmute);
    };
  }, [muted]);

  const src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&showinfo=0&modestbranding=1&rel=0&disablekb=1&iv_load_policy=3&playsinline=1&enablejsapi=1`;

  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
          // gentle vignette over the video so card backgrounds still pop
          // (the video itself is dimmed via iframe opacity below)
          boxShadow: 'inset 0 0 220px 80px rgba(10,14,20,0.85)',
        }}
      >
        <iframe
          ref={iframeRef}
          src={src}
          title=""
          allow="autoplay; encrypted-media"
          frameBorder={0}
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            // 16:9 aspect — whichever dimension is bigger covers the viewport
            width: '177.78vh',
            height: '100vh',
            minWidth: '100vw',
            minHeight: '56.25vw',
            opacity: 0.45,
            filter: 'blur(1.5px) saturate(1.1)',
            pointerEvents: 'none',
            border: 'none',
          }}
        />
      </div>

      {muted && (
        <div
          style={{
            position: 'fixed',
            bottom: 14,
            left: 14,
            zIndex: 5,
            fontSize: 11,
            color: 'var(--muted)',
            background: 'rgba(10,14,20,0.7)',
            border: '1px solid var(--border)',
            padding: '4px 9px',
            borderRadius: 4,
            pointerEvents: 'none',
            backdropFilter: 'blur(4px)',
          }}
        >
          🔊 click anywhere to unmute
        </div>
      )}
    </>
  );
}
