import path from 'path';
import { defineConfig } from "vite";
import glsl from "vite-plugin-glsl";

export default defineConfig({
  plugins: [glsl()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true
  },
  server: {
    fs: {
      strict: false,
      allow: ['..']
    },
    open: true
  },
  optimizeDeps: {
    include: ['dat.gui']
  }
});
