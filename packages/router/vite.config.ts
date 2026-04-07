import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'RainbowRouter',
      fileName: 'index',
    },
    rollupOptions: {
      external: ['@rhi-zone/rainbow'],
    },
  },
})
