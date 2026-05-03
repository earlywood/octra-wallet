import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx, defineManifest } from '@crxjs/vite-plugin';

const manifest = defineManifest({
  manifest_version: 3,
  name: 'Unofficial Octra Wallet',
  version: '0.1.0',
  description: 'Unofficial browser wallet for the Octra network with built-in OCT ↔ wOCT bridge. Not affiliated with Octra Labs.',
  action: { default_popup: 'src/popup/index.html', default_title: 'Unofficial Octra Wallet' },
  background: { service_worker: 'src/background/service-worker.ts', type: 'module' },
  permissions: ['storage', 'tabs'],
  host_permissions: [
    'http://*/*',
    'https://*/*',
  ],
  icons: {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
});

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  server: { port: 5173, strictPort: true, hmr: { port: 5173 } },
  build: { target: 'es2022', sourcemap: true },
});
