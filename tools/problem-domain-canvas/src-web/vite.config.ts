import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 产物必须能被静态直接打开：资源走相对路径，产物落 ../site（发布脚本只拷 site/，不构建）。
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: '../site',
    emptyOutDir: true,
    sourcemap: false,
  },
});
