// Hidden document used purely as an audio host. The MV3 Offscreen API allows
// extensions to spin up a non-visible document specifically for things like
// AUDIO_PLAYBACK that would otherwise stop when the popup closes. The service
// worker creates this doc when needed and posts {target:'offscreen', kind:...}
// messages here to control the player.

const player = document.getElementById('player') as HTMLAudioElement | null;
if (!player) {
  // index.html is bundled with this script — if the element is missing, the
  // build is broken. Fail loudly instead of TypeError'ing on every play.
  console.error('[octra-offscreen] missing #player audio element in index.html');
  throw new Error('offscreen audio element not found');
}

interface OffscreenMsg {
  target?: string;
  kind?: 'PLAY' | 'STOP';
  src?: string;
  volume?: number;
  loop?: boolean;
}

chrome.runtime.onMessage.addListener((msg: OffscreenMsg) => {
  if (msg?.target !== 'offscreen') return false;
  if (msg.kind === 'PLAY') {
    if (msg.src && player.src !== msg.src) player.src = msg.src;
    player.volume = typeof msg.volume === 'number' ? Math.max(0, Math.min(1, msg.volume)) : 0.6;
    player.loop = !!msg.loop;
    // best-effort autoplay; if blocked the play() promise rejects silently
    void player.play().catch(() => { /* autoplay declined — caller can retry on next gesture */ });
  } else if (msg.kind === 'STOP') {
    player.pause();
    player.currentTime = 0;
  }
  return false;
});

// when the song ends naturally (and we weren't looping), let the worker
// clean up the offscreen document so we're not holding resources idle.
player.addEventListener('ended', () => {
  if (!player.loop) chrome.runtime.sendMessage({ kind: 'OFFSCREEN_AUDIO_DONE' });
});
