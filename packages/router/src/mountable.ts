import type { RouteTree } from './types.ts'

/**
 * A `RouteTree` branded with a `Context` type that describes the params
 * guaranteed to be present in any route matched within this subtree.
 *
 * Used to build composable sub-routers that can be mounted at a dynamic
 * path segment. The `~context` property is a phantom type marker; it is
 * never present at runtime.
 */
export type Mountable<Context extends Record<string, string>> =
  RouteTree & { readonly '~context': Context }

/**
 * A factory function that stamps a `RouteTree` as `Mountable<Context>`.
 * Created by `defineMountable<Context>()`.
 */
export type MountableFactory<Context extends Record<string, string>> =
  <Tree extends RouteTree>(tree: Tree) => Tree & Mountable<Context>

/**
 * Define a reusable subtree factory for routes that require a specific param context.
 *
 * The type parameter `Context` declares which params will be available to all
 * routes mounted in this subtree (e.g. `{ teamId: string }`). The factory is a
 * no-op at runtime — it only applies the type brand.
 *
 * @example
 * ```ts
 * const teamMountable = defineMountable<{ teamId: string }>()
 *
 * const teamRoutes = teamMountable({
 *   '': { component: TeamPage },
 *   settings: { component: TeamSettingsPage },
 * })
 *
 * const routes: RouteTree = {
 *   teams: {
 *     _teamId: teamRoutes,
 *   },
 * }
 * ```
 */
export const defineMountable =
  <Context extends Record<string, string>>(): MountableFactory<Context> =>
  (tree) => tree as typeof tree & Mountable<Context>
