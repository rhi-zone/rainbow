# The Stack

Decided during design sessions for the `busier` tutoring platform dogfood app.

## Architecture

```
SW (service worker)     — offline queue, cache, push notifications
BFF (Hono on Bun)       — auth session, view-specific data aggregation
Domain slices           — headless business logic, unchanged
Worker (Bun)            — background jobs, outbox, cron
```

## Frontend

| Layer | Choice | Rationale |
|---|---|---|
| Rendering | **Lit** (Web Components) | Standards-aligned, zero lock-in, works anywhere |
| Reactivity | **@rhi-zone/rainbow** | Optics-based, headless, dogfood target |
| Routing | **@rhi-zone/rainbow-router** | Trie-based, tightly integrated with rainbow signals |
| Components | **Zag.js** (direct) | Framework-agnostic accessible state machines; Ark UI targets React/Vue/Solid |
| Build | **Vite** | Standard SPA bundler |

## Backend

| Layer | Choice | Rationale |
|---|---|---|
| HTTP framework | **Hono** | Lightweight, Bun-native, excellent TypeScript |
| Runtime | **Bun** | Native TypeScript, fast, no Node/Vinxi split |
| Database | **libSQL + Drizzle** | SQLite-compatible, remote-capable via Turso |
| Auth | **better-auth** | Full-featured, works with Hono |
| Email | **nodemailer** | Behind MailerPort adapter |
| Storage | **local disk / S3 stub** | Behind StoragePort adapter |
| AI | **Vercel AI SDK** | Behind LlmPort / EmbeddingsPort adapters |

## Why not SSR

The app is entirely authenticated — admin dashboard, parent portal, tutor
portal. Zero routes need SEO. SSR's latency advantage (faster first paint for
unauthenticated cold loads) is irrelevant. SPA wins after first load: instant
navigation, parallel data fetches, no server round-trip for HTML.

The prior SolidStart setup had persistent issues (Vinxi/Node ESM split,
`bun:sqlite` in SSR context, hydration mismatches) that all disappear with
a clean SPA + dedicated API server.

## Why not SolidStart / Nuxt / Astro

- **SolidStart v2** — replaces Vinxi with Nitro (fixes the pain points), but
  not stable yet. Worth revisiting once beta lands.
- **Nuxt** — mature and reliable, but "maturity" isn't the goal. Long-term
  maintainability, understandability, performance, flexibility, and modularity
  favour standards-based primitives over framework conventions.
- **Astro** — good for content sites. Gets awkward for interactive dashboards
  with complex mutation flows.

## Why Lit + rainbow over Solid/Vue/React

Solid's fine-grained reactivity is excellent, but SolidStart is the pain
source. Rainbow + Lit separates concerns cleanly: rainbow owns reactive state
(optics model, `Signal<T>`, `AsyncData<T>`), Lit owns rendering (Web
Components, `ReactiveController`). Each layer is independently replaceable.

Web Components are a platform standard — no framework lock-in, works with
any tooling, future-proof.

## rainbow packages in play

```
@rhi-zone/rainbow          — core: Signal, Lens, Prism, Traversal, AsyncData
@rhi-zone/rainbow-router   — trie router, signals-based, Lit integration
```

Future packages likely needed:
- `@rhi-zone/rainbow-lit`  — ReactiveController helpers, directives
- `@rhi-zone/rainbow-zag`  — Zag.js state machine ↔ Signal bridge
