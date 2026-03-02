import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(defineConfig({
  title: 'Rainbow',
  description: 'Optics-based reactivity for the web',
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'API', link: '/api/' },
      { text: 'rhi', link: 'https://rhi.zone/' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Introduction', link: '/guide/' },
          { text: 'Optics', link: '/guide/optics' },
          { text: 'Reactivity', link: '/guide/reactivity' },
        ],
      },
      {
        text: 'API',
        items: [
          { text: 'Lens', link: '/api/lens' },
          { text: 'Prism', link: '/api/prism' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/rhi-zone/rainbow' },
    ],
  },
}))
