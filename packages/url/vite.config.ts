import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    environment: 'happy-dom',
  },
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'RainbowUrl',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['@rhi-zone/rainbow'],
    },
  },
})
