import { defineConfig } from 'vite';

// Hosts the dev/preview server may answer for. The Genspark sandbox serves
// previews through rotating "*.sandbox.*.sspark.ai" hostnames; Vite rejects an
// unknown Host header by default (DNS-rebinding guard), which shows up as
// "Blocked request. This host ... is not allowed.". A leading dot also allows
// every subdomain.
const allowedHosts = ['.sspark.ai'];

// base: './' keeps asset paths relative so the build works both on the
// dev server and from a GitHub Pages project sub-path (e.g. /dinosaur-fight-hyun/).
export default defineConfig({
  base: './',
  server: {
    host: true,
    allowedHosts,
  },
  preview: {
    host: true,
    allowedHosts,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
});
