import '@testing-library/jest-dom'

// Node 26 defines a `localStorage` global that stays undefined unless
// --localstorage-file is passed, and it shadows the jsdom implementation.
// Provide an in-memory Storage so browser-persistence code paths are testable.
if (!globalThis.localStorage) {
  const entries = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return entries.size
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => {
      entries.delete(key)
    },
    setItem: (key, value) => {
      entries.set(key, String(value))
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  })
}
