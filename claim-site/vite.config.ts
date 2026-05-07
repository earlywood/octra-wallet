import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

// Deployed to a custom subdomain (octra.ac420.org), so the site lives at the
// root of its host. If you fork this and host at a subpath like
// https://USER.github.io/REPO/, override with CLAIM_SITE_BASE=/REPO/.
const base = process.env.CLAIM_SITE_BASE ?? '/';

const buildHash = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); }
  catch { return 'dev'; }
})();
const buildTime = new Date().toISOString().slice(0, 16).replace('T', ' ');

export default defineConfig({
  plugins: [react()],
  base,
  // Allow vite dev server to serve files from ../shared (sibling to this project).
  server: { fs: { allow: ['..'] } },
  define: {
    __BUILD_HASH__: JSON.stringify(buildHash),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
