import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx, defineManifest } from '@crxjs/vite-plugin';
import { execSync } from 'node:child_process';

const buildHash = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); }
  catch { return 'dev'; }
})();
const buildTime = new Date().toISOString().slice(0, 16).replace('T', ' ');

const manifest = defineManifest({
  manifest_version: 3,
  name: 'Unofficial Octra Wallet',
  version: '1.0.1',
  description: 'Unofficial browser wallet for the Octra network with built-in OCT ↔ wOCT bridge. Not affiliated with Octra Labs.',
  action: { default_popup: 'src/popup/index.html', default_title: 'Unofficial Octra Wallet' },
  background: { service_worker: 'src/background/service-worker.ts', type: 'module' },
  permissions: ['storage', 'offscreen'],
  // Narrowed to the URLs we actually hit by default — the CF Worker proxy
  // (which fronts both Octra RPC and the bridge relayer) and a public
  // mainnet ETH RPC for read-only wOCT balance queries. Users who customise
  // RPC URLs in Settings can grant additional hosts via the optional list.
  host_permissions: [
    'https://octra-relay.salamistroker.workers.dev/*',
    'https://ethereum-rpc.publicnode.com/*',
  ],
  optional_host_permissions: [
    'http://*/*',
    'https://*/*',
  ],
  // Lets the bridge claim site post a direct "claim landed" signal back to
  // the extension instead of waiting for the popup's recovery.json poll loop
  // to detect it (which can take 30–90s after a claim confirms on eth).
  // Origin matches the default claimUrl; users who self-host elsewhere will
  // fall back to polling, which still works.
  externally_connectable: {
    matches: ['https://octra.ac420.org/*'],
  },
  icons: {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
});

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  // Allow vite dev server to serve files from ../shared (sibling to this project).
  server: { port: 5173, strictPort: true, hmr: { port: 5173 }, fs: { allow: ['..'] } },
  define: {
    __BUILD_HASH__: JSON.stringify(buildHash),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        offscreen: 'src/offscreen/index.html',
      },
    },
  },
});
