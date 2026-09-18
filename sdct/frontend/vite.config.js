import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`        -> dist/          deploy to Azure Web App (served by the Express API or Static Web App)
// `npm run build:mockup` -> dist-mockup/   one self-contained HTML file that runs in demo mode (no backend)
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'mockup' ? [viteSingleFile()] : [])],
  build: {
    outDir: mode === 'mockup' ? 'dist-mockup' : 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
  },
  server: { port: 5173, proxy: { '/api': 'http://localhost:8080' } },
}));
