import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-ignore - plain JS build helper (see the comment at the top of that file)
import ynFit from './tools/postcss-yn-fit.mjs';
export default defineConfig({
  plugins: [react()],
  css: { postcss: { plugins: [ynFit()] } },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Libraries rarely change, so keep them in their own files: the browser caches them across deploys
        // and the app code chunk stays small.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('leaflet')) return 'vendor-leaflet';
          if (id.includes('lucide-react')) return 'vendor-icons';
          return undefined;
        },
      },
    },
  },
});
