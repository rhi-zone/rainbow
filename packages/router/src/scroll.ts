import type { ScrollHandler } from './types.ts'

// ---------------------------------------------------------------------------
// scrollTop — always scroll to top of page
// ---------------------------------------------------------------------------

export const scrollTop: ScrollHandler = (_nav) => {
  window.scrollTo(0, 0)
}

// ---------------------------------------------------------------------------
// scrollNone — no-op handler
// ---------------------------------------------------------------------------

export const scrollNone: ScrollHandler = (_nav) => {
  // intentional no-op
}

// ---------------------------------------------------------------------------
// scrollToHash — scroll to anchor element when hash is present
// ---------------------------------------------------------------------------

export const scrollToHash: ScrollHandler = (nav) => {
  if (nav.hash) {
    document.getElementById(nav.hash)?.scrollIntoView()
  }
}

// ---------------------------------------------------------------------------
// scrollRestore — save/restore scroll position across navigations
//
// On push/replace: merge the current scroll coordinates into history.state
//   (using replaceState so we don't add a new entry), then scroll to the
//   hash anchor if present, otherwise scroll to top.
//
// On pop: restore the scroll position stored in the incoming history.state.
//   The browser has already moved to the new entry before popstate fires, so
//   history.state here is the state of the destination entry.
// ---------------------------------------------------------------------------

type ScrollState = {
  _scrollX?: number
  _scrollY?: number
}

export const scrollRestore: ScrollHandler = (nav) => {
  if (nav.type === 'push' || nav.type === 'replace') {
    // Save the current scroll position into the *current* history entry before
    // we navigate away.  We use replaceState rather than pushState so we don't
    // create a new entry — we're just annotating the entry we're leaving.
    const currentState: Record<string, unknown> =
      (typeof history.state === 'object' && history.state !== null)
        ? { ...(history.state as Record<string, unknown>) }
        : {}
    currentState['_scrollX'] = window.scrollX
    currentState['_scrollY'] = window.scrollY
    history.replaceState(currentState, '')

    // For the destination: scroll to hash if present, otherwise top.
    if (nav.hash) {
      document.getElementById(nav.hash)?.scrollIntoView()
    } else {
      window.scrollTo(0, 0)
    }
  } else {
    // pop — restore the saved position from the destination entry's state.
    const state = history.state as ScrollState | null
    const x = state?._scrollX ?? 0
    const y = state?._scrollY ?? 0
    window.scrollTo(x, y)
  }
}
