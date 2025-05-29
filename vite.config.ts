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
    sourcemap: true
  },
  server: {
    fs: {
      strict: false,
      allow: ['..']
    }
  },
  optimizeDeps: {
    include: ['dat.gui']
  }
});
