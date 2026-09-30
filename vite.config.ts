import { defineConfig } from 'vite';

// base: './' keeps asset paths relative so the build works both on the
// dev server and from a GitHub Pages project sub-path (e.g. /dinosaur-fight-hyun/).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
});
