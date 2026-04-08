import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    environment: 'happy-dom',
  },
  build: {
    lib: {
      entry: {
        index:  'src/index.ts',
        html:   'src/html.ts',
        widget: 'src/widget.ts',
      },
      name: 'RainbowUi',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['@rhi-zone/rainbow'],
    },
  },
})
