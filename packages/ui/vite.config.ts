import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    environment: 'happy-dom',
  },
  build: {
    lib: {
      entry: {
        index:    'src/index.ts',
        html:     'src/html.ts',
        widget:   'src/widget.ts',
        elements:   'src/elements.ts',
        'form-state': 'src/form-state.ts',
        'reactive-html': 'src/reactive-html.ts',
        combinators: 'src/combinators.ts',
      },
      name: 'RainbowUi',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['@rhi-zone/rainbow'],
    },
  },
})
