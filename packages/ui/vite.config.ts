import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: 'src/index.ts',
        html:  'src/html.ts',
      },
      name: 'RainbowUi',
      formats: ['es'],
    },
  },
})
