# @rhi-zone/rainbow-ui

Type-safe DOM factories and algebraic widget combinators for rainbow.

## What it is

rainbow-ui gives you a pure-TypeScript UI layer built on rainbow signals. No
virtual DOM, no JSX, no template compiler. DOM elements are created via
type-safe factories; reactive bindings connect signals to the DOM directly.

Key features:

- **html** — Type-safe DOM element factories with content-model constraints
  (e.g., `html.tr` only accepts `html.td`/`html.th` children)
- **Widget combinators** — `focus`, `narrow`, `each`, `beside`, `above`,
  `concat`, `stack`, `dynamic`, `map`, `show`, `template`, `eachKeyed`, `match`
- **Binding helpers** — `bindInput`, `bindSelect`, `bindCheckbox`, `bindText`,
  `bindAttr`, `bindClass`, `bindShow`
- **Form state** — `createForm` with validation
- **Custom elements** — `defineElement` with attribute optics (`attrString`,
  `attrNumber`, `attrBoolean`)
- **No framework dependency** — vanilla DOM, works anywhere

## Entry points

| Import | Contents |
|---|---|
| `@rhi-zone/rainbow-ui` | Widget combinators, form state, keybinds, custom elements |
| `@rhi-zone/rainbow-ui/html` | Type-safe DOM factories |
| `@rhi-zone/rainbow-ui/widget` | Widget combinators only |
| `@rhi-zone/rainbow-ui/elements` | `defineElement`, attribute optics |
| `@rhi-zone/rainbow-ui/form-state` | `createForm`, validation |
| `@rhi-zone/rainbow-ui/reactive-html` | Reactive HTML element factories |

## Install

```sh
npm install @rhi-zone/rainbow-ui
```

## Quick example

```ts
import { signal, field } from '@rhi-zone/rainbow'
import { mount, above, prop, bindInput, bindText } from '@rhi-zone/rainbow-ui'
import type { Widget } from '@rhi-zone/rainbow-ui/widget'

interface State { name: string }

const nameWidget: Widget<string> = (s) => {
  const input = document.createElement('input')
  input.placeholder = 'Your name'
  bindInput(input, s)
  return { _tag: 'input', node: input }
}

const greetingWidget: Widget<string> = (s) => {
  const p = document.createElement('p')
  bindText(p, s.map((name) => `Hello, ${name || 'world'}!`))
  return { _tag: 'p', node: p }
}

const app = above(prop(nameWidget, 'name'), prop(greetingWidget, 'name'))

const state = signal<State>({ name: '' })
mount(app, state, document.body)
```

## Docs

Full guides, API reference, and design notes are at the [Rainbow VitePress
site](https://rhi.zone/rainbow/).

## License

MIT
