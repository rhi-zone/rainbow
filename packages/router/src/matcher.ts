import type { RouteTree, RouteConfig, MatchedRoute } from './types.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize a route node value into a RouteConfig. */
function toConfig(node: unknown): RouteConfig {
  if (node === null || node === undefined) return {}
  if (typeof node === 'object' && !isSubtree(node as object)) return node as RouteConfig
  // Plain component (function/class) used as shorthand
  return { component: node }
}

/** Reserved keys that belong to RouteConfig, not path segments. */
const CONFIG_KEYS = new Set(['component', 'loader', 'params', 'scroll'])

/**
 * A node is a subtree if it has at least one key that isn't a RouteConfig key.
 * This distinguishes { component: X } (config) from { admin: X, '': Y } (subtree).
 * Mixed nodes like { params: X, '': Y, _id: Z } are also subtrees.
 */
function isSubtree(node: object): node is RouteTree {
  return Object.keys(node).some(k => !CONFIG_KEYS.has(k))
}

/** Find the dynamic segment key in a subtree node, if any. */
function findDynKey(node: RouteTree): string | undefined {
  return Object.keys(node).find(k => k.startsWith('_'))
}

// ---------------------------------------------------------------------------
// Matcher
// ---------------------------------------------------------------------------

/**
 * Match a pathname against a route tree.
 *
 * Algorithm (mirrors the Lua trie router):
 * 1. Split pathname into segments
 * 2. Walk the tree segment-by-segment
 * 3. At each node: try exact key first, then `_name` dynamic key
 * 4. Run ParamParser for dynamic segment — null return = no match → 404
 * 5. Collect `''` handlers at intermediate nodes as layout layers
 * 6. At final segment: `''` key is the leaf handler
 */
export function match(tree: RouteTree, pathname: string): MatchedRoute | null {
  const segments = pathname.split('/').filter(Boolean)
  const params: Record<string, unknown> = {}
  const layouts: RouteConfig[] = []

  // Collect root-level layout if present
  if ('' in tree) layouts.push(toConfig(tree['']))

  let node: RouteTree = tree

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!
    const isLast = i === segments.length - 1

    // Try exact segment key
    let next: unknown = (node as Record<string, unknown>)[seg]

    // Fall through to dynamic key
    if (next === undefined) {
      const dynKey = findDynKey(node)
      if (dynKey === undefined) return null

      const paramName = dynKey.slice(1)
      const nodeConfig = node as Record<string, unknown>
      const dynNode = nodeConfig[dynKey] as RouteTree | RouteConfig | unknown

      // Run ParamParser if declared on the dynamic node
      const config = isSubtree(dynNode as object)
        ? (dynNode as RouteTree)
        : dynNode

      const parsers = (config as RouteConfig)?.params
      if (parsers && paramName in parsers) {
        const parsed = parsers[paramName]!(seg)
        if (parsed === null) return null
        params[paramName] = parsed
      } else {
        params[paramName] = seg
      }

      next = dynNode
    }

    // Can't continue walking
    if (next === null || next === undefined) return null

    const nextIsSubtree = typeof next === 'object' && isSubtree(next as object)

    if (!nextIsSubtree) {
      // Leaf shorthand — only valid on last segment
      if (!isLast) return null
      return {
        layouts,
        leaf: toConfig(next),
        params,
        pathname,
      }
    }

    node = next as RouteTree

    // Collect layout from `''` key at intermediate nodes
    if (!isLast && '' in node) {
      layouts.push(toConfig((node as Record<string, unknown>)['']))
    }
  }

  // Consumed all segments — look for `''` handler at current node
  const leafNode = (node as Record<string, unknown>)['']
  if (leafNode === undefined) return null

  return {
    layouts,
    leaf: toConfig(leafNode),
    params,
    pathname,
  }
}
