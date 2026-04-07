import { createRouter as _createRouter } from './router.ts'
import { scrollRestore } from './scroll.ts'
import type { RouterOptions, Router } from './router.ts'
import type { RouteTree } from './types.ts'

export const createRouter = (
  tree: RouteTree,
  options?: Omit<RouterOptions, 'scroll'> & { scroll?: RouterOptions['scroll'] },
): Router => {
  const scroll = options?.scroll ?? scrollRestore
  return _createRouter(tree, { ...options, scroll })
}
