import type { RouteTree } from './types.ts'

export type Mountable<Context extends Record<string, string>> =
  RouteTree & { readonly '~context': Context }

export type MountableFactory<Context extends Record<string, string>> =
  <Tree extends RouteTree>(tree: Tree) => Tree & Mountable<Context>

export const defineMountable =
  <Context extends Record<string, string>>(): MountableFactory<Context> =>
  (tree) => tree as typeof tree & Mountable<Context>
