// Minimal shape needed for dep tracking — avoids importing from signal.ts
// (which imports tracking.ts, creating a circular dependency).
type Dep = { subscribe(fn: (value: unknown) => void): () => void }

export type Tracker = {
  add(dep: Dep): void
}

let _current: Tracker | null = null

export function track(dep: Dep): void {
  _current?.add(dep)
}

export function runWithTracker<T>(tracker: Tracker, fn: () => T): T {
  const prev = _current
  _current = tracker
  try {
    return fn()
  } finally {
    _current = prev
  }
}
