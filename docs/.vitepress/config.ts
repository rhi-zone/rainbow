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
          { text: 'Rainbow Router', link: '/guide/rainbow-router' },
        ],
      },
      {
        text: 'API',
        items: [
          { text: 'API Reference', link: '/api/' },
          { text: 'Rainbow Router', link: '/api/rainbow-router' },
        ],
      },
      {
        text: 'Design Notes',
        collapsed: true,
        items: [
          { text: 'Why no dynamic?', link: '/design/dynamic' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/rhi-zone/rainbow' },
    ],
  },
}))
