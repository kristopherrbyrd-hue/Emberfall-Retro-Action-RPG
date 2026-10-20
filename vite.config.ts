import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// No Replit services or environment variables are required.
const projectDir = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  // Relative URLs resolve correctly inside Capacitor's https://localhost WebView.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(projectDir, 'src') },
    dedupe: ['react', 'react-dom'],
  },
  build: { outDir: 'dist', emptyOutDir: true },
  server: { host: '0.0.0.0', port: 5173 },
});
