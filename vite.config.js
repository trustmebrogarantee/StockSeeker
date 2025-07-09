import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  base: '/StockSeeker/',
  root: path.resolve(__dirname, 'modules/view'), // Set the root directory to src
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'modules/view/index.html'), // Path to your HTML file
      },
    },
    outDir: './dist', // Output directory relative to root (src), so it goes to project root/dist
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'modules/view'), // Optional: alias for easier imports
    },
  },
});