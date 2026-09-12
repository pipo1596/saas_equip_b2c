/**
 * Node 22+ exposes `localStorage` as a native global, but it only actually
 * works when the process is started with `--localstorage-file`. Without
 * that flag it's present but throws on use, which breaks anything relying
 * on `AuthService`'s persisted session (this project's tests included).
 * `sessionStorage` doesn't have this problem (Node backs it in-memory with
 * no flag needed), so this only needs to patch `localStorage` — with a
 * small in-memory stand-in, keeping tests hermetic (no shared state file
 * across parallel workers or separate test runs).
 */
class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) ?? null) : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

function worksAsStorage(candidate: unknown): candidate is Storage {
  if (!candidate || typeof (candidate as Storage).setItem !== 'function') {
    return false;
  }
  try {
    const probeKey = '__storage_probe__';
    (candidate as Storage).setItem(probeKey, '1');
    (candidate as Storage).removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

if (!worksAsStorage(globalThis.localStorage)) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}
