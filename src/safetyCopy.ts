import { parseDocument, type InkPadDocument } from './documentFormat'

/**
 * The safety copy: a second, always-writable copy of the open diagram kept in this browser's IndexedDB, under every
 * StorageBackend. It exists because the real storage can be locked (Google sign-in lapsed, device-folder permission not
 * given again after a reload) or slow (the autosave debounce), and nothing was kept anywhere in those moments.
 *
 * The record is the same text as a saved .inkpad file (stringifyDocument), so the saved format does not change.
 * A record is "dirty" while rev > syncedRev, meaning the backend does not yet hold the latest copy.
 * This module has no React and no DOM; the browser pieces (IndexedDB, localStorage, timers) are injected or adapters.
 */

export type SafetyKind = 'browser' | 'device' | 'drive'

export type SafetyRecord = {
  key: string
  kind: SafetyKind
  docId: string | null
  folderId: string | null
  /** stringifyDocument output. */
  text: string
  rev: number
  syncedRev: number
  savedAt: string
}

export const isDirty = (record: SafetyRecord) => record.rev > record.syncedRev

export type SafetyStore = {
  get(key: string): Promise<SafetyRecord | null>
  put(record: SafetyRecord): Promise<void>
  remove(key: string): Promise<void>
  list(): Promise<SafetyRecord[]>
}

export function createMemorySafetyStore(): SafetyStore {
  const records = new Map<string, SafetyRecord>()
  return {
    async get(key) { const found = records.get(key); return found ? { ...found } : null },
    async put(record) { records.set(record.key, { ...record }) },
    async remove(key) { records.delete(key) },
    async list() { return [...records.values()].map((record) => ({ ...record })) },
  }
}

const DB_NAME = 'inkpad-recovery'
const DB_VERSION = 1
const STORE_NAME = 'copies'

/** A separate IndexedDB database (the main `inkpad` one is never touched). Falls back to memory where IndexedDB is missing. */
export function createIndexedDbSafetyStore(): SafetyStore {
  if (typeof indexedDB === 'undefined') return createMemorySafetyStore()
  let opened: Promise<IDBDatabase> | null = null
  const open = () => (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => { opened = null; reject(request.error ?? new Error('Could not open the recovery store.')) }
    // another tab holds an older connection open: do not wait for it forever
    request.onblocked = () => { opened = null; reject(new Error('The recovery store is blocked by another tab.')) }
  }))
  const run = async <T,>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open()
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode)
      const request = work(transaction.objectStore(STORE_NAME))
      // a write is done only when its transaction completes, not when the request succeeds
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error('Recovery store failed.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Recovery store aborted.'))
    })
  }
  return {
    async get(key) { return ((await run('readonly', (store) => store.get(key))) as SafetyRecord | undefined) ?? null },
    async put(record) { await run('readwrite', (store) => store.put(record)) },
    async remove(key) { await run('readwrite', (store) => store.delete(key)) },
    async list() { return (await run('readonly', (store) => store.getAll())) as SafetyRecord[] },
  }
}

/** Where the "current key per kind" lives. */
export type SafetyPointer = { get(kind: SafetyKind): string | null; set(kind: SafetyKind, key: string | null): void }
/** A last-moment copy in localStorage (synchronous), used only when IndexedDB could not be written before the page went away. */
export type SafetyEmergency = { read(): SafetyRecord | null; write(record: SafetyRecord): void; clear(): void }

export const SAFETY_POINTER_PREFIX = 'inkpad.safety.current.'
export const SAFETY_EMERGENCY_KEY = 'inkpad.safety.emergency'
export const EMERGENCY_MAX_CHARS = 2_000_000

type StringStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

export function createLocalStoragePointer(storage: StringStorage): SafetyPointer {
  return {
    get(kind) { try { return storage.getItem(SAFETY_POINTER_PREFIX + kind) } catch { return null } },
    set(kind, key) {
      try {
        if (key) storage.setItem(SAFETY_POINTER_PREFIX + kind, key)
        else storage.removeItem(SAFETY_POINTER_PREFIX + kind)
      } catch { /* the fallback lookup still finds unsaved new diagrams */ }
    },
  }
}

export function createLocalStorageEmergency(storage: StringStorage): SafetyEmergency {
  return {
    read() {
      try {
        const raw = storage.getItem(SAFETY_EMERGENCY_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as Partial<SafetyRecord>
        if (!parsed || typeof parsed.key !== 'string' || typeof parsed.text !== 'string' || typeof parsed.rev !== 'number') return null
        return parsed as SafetyRecord
      } catch { return null }
    },
    write(record) { storage.setItem(SAFETY_EMERGENCY_KEY, JSON.stringify(record)) },
    clear() { try { storage.removeItem(SAFETY_EMERGENCY_KEY) } catch { /* ignore */ } },
  }
}

type LockManagerLike = { request(name: string, options: { ifAvailable: boolean }, callback: (lock: unknown) => unknown): Promise<unknown> }

/**
 * Takes the tab-lifetime lock that makes one tab the only one to restore and upload leftovers (a second tab would
 * otherwise restore the same copies again and duplicate diagrams). Held until the page is gone. True = this tab leads;
 * also true where Web Locks do not exist (then behave as before).
 */
export function acquireTabLock(locks: LockManagerLike | undefined, name = 'inkpad-safety'): Promise<boolean> {
  if (!locks) return Promise.resolve(true)
  return new Promise<boolean>((resolve) => {
    try {
      void Promise.resolve(locks.request(name, { ifAvailable: true }, (lock) => {
        if (!lock) { resolve(false); return undefined }
        resolve(true)
        return new Promise<void>(() => undefined) // never released: the browser frees it when the tab goes away
      })).catch(() => resolve(true))
    } catch { resolve(true) }
  })
}

export type SafetyKeeperDeps<S> = {
  store: SafetyStore
  setTimeout: (callback: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
  now: () => number
  pointer: SafetyPointer
  emergency?: SafetyEmergency
  /** Runs low-priority work when the browser is idle (requestIdleCallback); omit to run it straight away. */
  idle?: (callback: () => void) => void
  randomKey?: () => string
  getKind: () => SafetyKind
  getDocId: () => string | null
  getFolderId: () => string | null
  hasContent: () => boolean
  isInputActive: () => boolean
  signature: () => S
  /** What the real storage last confirmed holding for the open diagram (null when unknown). A copy equal to it is clean. */
  backendSignature?: () => S | null
  sameSignature: (a: S | null, b: S | null) => boolean
  buildText: () => string
}

export type RestoredCopy = { record: SafetyRecord; document: InkPadDocument }

export const SAFETY_DEBOUNCE_MS = 400
export const SAFETY_MAX_WAIT_MS = 3000

type State<S> = {
  kind: SafetyKind | null
  key: string | null
  rev: number
  syncedRev: number
  /** The existing record for this key has been read, so rev and syncedRev continue from it. */
  loaded: boolean
  /** Signature of the last text that reached the store. */
  sig: S | null
  /** Signature the backend last confirmed saving. */
  syncedSig: S | null
}

export function createSafetyKeeper<S>(deps: SafetyKeeperDeps<S>) {
  const randomKey = deps.randomKey ?? (() => `${deps.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`)
  let state: State<S> = freshState(null, null)
  let timer: unknown = null
  let pendingSince: number | null = null
  let chain: Promise<void> = Promise.resolve()
  let gate: Promise<void> | null = null
  let openGate: (() => void) | null = null
  /** The emergency copy this keeper wrote and has not seen cleared: which diagram and when. */
  let emergencyMark: { key: string; savedAt: string; sig: S } | null = null

  function freshState(kind: SafetyKind | null, key: string | null): State<S> {
    return { kind, key, rev: 0, syncedRev: 0, loaded: false, sig: null, syncedSig: null }
  }
  const enqueue = (work: () => Promise<void>): Promise<void> => {
    const run = chain.then(work, work).catch(() => undefined)
    chain = run
    return run
  }
  const keyFor = (kind: SafetyKind, docId: string) => `${kind}:${docId}`
  /** The backend already holds exactly this content for the open (already saved) diagram, or the keeper was told it saved it. */
  const isSynced = (sig: S, docId: string | null): boolean => {
    if (state.syncedSig !== null && deps.sameSignature(sig, state.syncedSig)) return true
    if (docId === null || !deps.backendSignature) return false
    return deps.sameSignature(sig, deps.backendSignature())
  }
  const clearEmergencyFor = (key: string, savedAt: string, sig: S) => {
    // same millisecond: only when the stored text is the very content the emergency copy holds
    if (emergencyMark && emergencyMark.key === key && (savedAt > emergencyMark.savedAt || (savedAt === emergencyMark.savedAt && deps.sameSignature(sig, emergencyMark.sig)))) {
      emergencyMark = null
      deps.emergency?.clear()
    }
  }

  /** The key the open diagram is stored under; keeps the "new" key stable until the diagram gets an id. */
  const resolveKey = (): string => {
    const kind = deps.getKind()
    const docId = deps.getDocId()
    if (docId) {
      const key = keyFor(kind, docId)
      if (state.key !== key) state = freshState(kind, key)
      return key
    }
    if (state.key && state.kind === kind && state.key.startsWith(`${kind}:new:`)) return state.key
    const key = `${kind}:new:${randomKey()}`
    state = freshState(kind, key)
    return key
  }

  const cancelTimer = () => {
    if (timer !== null) { deps.clearTimeout(timer); timer = null }
  }
  const schedule = (ms: number) => {
    cancelTimer()
    timer = deps.setTimeout(fire, ms)
  }
  function fire() {
    timer = null
    if (deps.isInputActive()) { schedule(SAFETY_DEBOUNCE_MS); return }
    const start = () => {
      if (deps.isInputActive()) { schedule(SAFETY_DEBOUNCE_MS); return }
      pendingSince = null
      void write()
    }
    if (deps.idle) deps.idle(start)
    else start()
  }

  const write = (): Promise<void> => enqueue(async () => {
    if (gate) await gate
    const kind = deps.getKind()
    const docId = deps.getDocId()
    if (!docId && !deps.hasContent()) return
    const key = resolveKey()
    if (!state.loaded) {
      try {
        const existing = await deps.store.get(key)
        if (existing) { state.rev = existing.rev; state.syncedRev = existing.syncedRev }
      } catch { /* start from zero */ }
      state.loaded = true
      // the open diagram may have changed while the read was waiting
      if (resolveKey() !== key) return
    }
    // From here to the put call nothing waits, so the signature and the text describe the same moment.
    const sig = deps.signature()
    if (state.sig !== null && deps.sameSignature(sig, state.sig)) return
    const synced = isSynced(sig, docId)
    // Content the storage already holds, with no unsaved copy waiting: nothing to keep (an opened-only diagram must not become a dirty record).
    if (synced && state.rev <= state.syncedRev) return
    const text = deps.buildText()
    const rev = state.rev + 1
    const record: SafetyRecord = {
      key, kind, docId, folderId: deps.getFolderId(), text, rev,
      syncedRev: synced ? rev : state.syncedRev,
      savedAt: new Date(deps.now()).toISOString(),
    }
    try {
      await deps.store.put(record)
    } catch {
      return // stays unstored; the next change or flush tries again
    }
    if (state.key !== key) return
    state.rev = rev
    state.syncedRev = record.syncedRev
    state.sig = sig
    deps.pointer.set(kind, key)
    clearEmergencyFor(key, record.savedAt, sig)
  })


  const parse = (record: SafetyRecord): RestoredCopy | null => {
    try {
      const result = parseDocument(record.text)
      return result.ok ? { record, document: result.document } : null
    } catch { return null }
  }

  const restoreNow = async (kind: SafetyKind, isAbandoned: () => boolean): Promise<RestoredCopy | null> => {
    const candidates: SafetyRecord[] = []
    try {
      const key = deps.pointer.get(kind)
      const pointed = key ? await deps.store.get(key) : null
      if (pointed && pointed.kind === kind && isDirty(pointed)) candidates.push(pointed)
      const emergency = deps.emergency?.read()
      if (emergency && !isAbandoned()) {
        const stored = emergency.key === pointed?.key ? pointed : await deps.store.get(emergency.key)
        if (isAbandoned()) return null
        if (!stored || emergency.savedAt >= stored.savedAt) {
          // It is the newest copy. Its rev can be from early in a session, so it continues after the stored one.
          const rev = Math.max(emergency.rev, (stored?.rev ?? 0) + 1)
          const clean = emergency.syncedRev >= emergency.rev
          const merged: SafetyRecord = { ...emergency, rev, syncedRev: clean ? rev : Math.min(emergency.syncedRev, rev - 1) }
          let moved = false
          try { await deps.store.put(merged); moved = true } catch { /* keep the localStorage copy */ }
          if (moved) deps.emergency?.clear()
          const index = candidates.findIndex((entry) => entry.key === merged.key)
          if (index >= 0) candidates.splice(index, 1)
          if (emergency.kind === kind && isDirty(merged)) candidates.unshift(merged)
        } else {
          deps.emergency?.clear() // older than what is stored: stale
        }
      } else if (emergency) {
        return null
      }
      if (candidates.length === 0 && !pointed) {
        const unsaved = (await deps.store.list()).filter((entry) => entry.kind === kind && entry.docId === null && isDirty(entry))
        unsaved.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))
        candidates.push(...unsaved)
      }
    } catch { return null }
    candidates.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))
    for (const record of candidates) {
      const parsed = parse(record)
      if (parsed) return parsed
    }
    return null
  }

  return {
    /** Holds writes (startup) until release(), so a restore check can never be overtaken by an empty sheet. */
    hold() {
      if (gate) return
      gate = new Promise<void>((resolve) => { openGate = resolve })
    },
    release() {
      const open = openGate
      gate = null
      openGate = null
      open?.()
    },

    /** Call after every edit. Cheap: sets a timer; the work happens later, never while the pen is down. */
    noteChange() {
      const now = deps.now()
      if (pendingSince === null) pendingSince = now
      if (now - pendingSince > SAFETY_MAX_WAIT_MS) {
        // waiting long already: stop pushing the write back and take the next moment the pen is up
        if (timer === null) schedule(0)
        return
      }
      schedule(SAFETY_DEBOUNCE_MS)
    },

    /** Writes now if something changed. Resolves when the store write is done. */
    flush(): Promise<void> {
      cancelTimer()
      pendingSince = null
      return write()
    },

    /** Synchronous last resort for pagehide: the text goes to localStorage when IndexedDB has not confirmed the latest change yet. */
    emergencySave() {
      if (!deps.emergency) return
      try {
        const kind = deps.getKind()
        const docId = deps.getDocId()
        if (!docId && !deps.hasContent()) return
        const key = resolveKey()
        const sig = deps.signature()
        if (state.sig !== null && deps.sameSignature(sig, state.sig)) return
        const synced = isSynced(sig, docId)
        if (synced && state.rev <= state.syncedRev) return
        const text = deps.buildText()
        if (text.length >= EMERGENCY_MAX_CHARS) return
        const rev = state.rev + 1
        const savedAt = new Date(deps.now()).toISOString()
        deps.emergency.write({
          key, kind, docId, folderId: deps.getFolderId(), text, rev,
          syncedRev: synced ? rev : state.syncedRev,
          savedAt,
        })
        emergencyMark = { key, savedAt, sig }
      } catch { /* storage full or blocked: nothing more can be done */ }
    },

    /** Content exists that neither the safety copy nor the backend holds. */
    hasUnstoredChanges(backendSaved: S | null): boolean {
      if (!deps.getDocId() && !deps.hasContent()) return false
      const sig = deps.signature()
      if (state.sig !== null && deps.sameSignature(sig, state.sig)) return false
      if (backendSaved !== null && deps.sameSignature(sig, backendSaved)) return false
      return true
    },

    /** The backend saved `signature`. Marks the copy clean when it matches, and moves it to the real id after a first save or rename. */
    markSynced(signature: S, previousId: string | null, newId: string): Promise<void> {
      const kind = deps.getKind()
      return enqueue(async () => {
        state.syncedSig = signature
        const key = state.key
        if (!key || state.kind !== kind) return
        const ours = previousId === null ? key.startsWith(`${kind}:new:`) : key === keyFor(kind, previousId)
        if (!ours && key !== keyFor(kind, newId)) return
        if (state.rev === 0) return
        const matches = state.sig !== null && deps.sameSignature(signature, state.sig)
        const wasSynced = state.syncedRev
        if (matches) state.syncedRev = state.rev
        const newKey = keyFor(kind, newId)
        if (key === newKey && state.syncedRev === wasSynced) return
        let record: SafetyRecord | null = null
        try { record = await deps.store.get(key) } catch { return }
        if (!record) return
        const next: SafetyRecord = { ...record, key: newKey, docId: newId, syncedRev: matches ? Math.max(record.syncedRev, record.rev) : record.syncedRev }
        try {
          await deps.store.put(next)
          if (newKey !== key) await deps.store.remove(key)
        } catch { return }
        if (newKey !== key) {
          state.key = newKey
          deps.pointer.set(kind, newKey)
          if (emergencyMark && emergencyMark.key === key) emergencyMark = { ...emergencyMark, key: newKey }
        }
      })
    },

    /**
     * The dirty copy to bring back at startup, or null. An emergency copy newer (by save time) than the stored one wins.
     * The emergency copy is always cleared once considered, so it can never resurface later over newer content.
     * If the store does not answer within `timeoutMs`, nothing is restored (the app must not stay without autosave).
     */
    restore(kind: SafetyKind, timeoutMs = 3000): Promise<RestoredCopy | null> {
      let abandoned = false
      const work = restoreNow(kind, () => abandoned)
      return new Promise<RestoredCopy | null>((resolve) => {
        const handle = deps.setTimeout(() => { abandoned = true; resolve(null) }, timeoutMs)
        work.then((value) => { deps.clearTimeout(handle); resolve(value) }, () => { deps.clearTimeout(handle); resolve(null) })
      })
    },

    /** A dirty local copy of this diagram (the backend does not have its latest edits), or null. */
    async recordFor(kind: SafetyKind, docId: string): Promise<RestoredCopy | null> {
      try {
        const record = await deps.store.get(keyFor(kind, docId))
        return record && isDirty(record) ? parse(record) : null
      } catch { return null }
    },

    /** Dirty copies of this kind other than the one in use: work left behind while storage was locked. */
    async leftovers(kind: SafetyKind): Promise<RestoredCopy[]> {
      try {
        const found: RestoredCopy[] = []
        for (const record of await deps.store.list()) {
          if (record.kind !== kind || !isDirty(record) || record.key === state.key) continue
          const parsed = parse(record)
          if (parsed) found.push(parsed)
        }
        return found.sort((a, b) => (a.record.savedAt < b.record.savedAt ? -1 : 1))
      } catch { return [] }
    },

    /** The open diagram is this restored or opened copy: continue its revision numbers and treat its text as already stored. */
    adopt(record: SafetyRecord) {
      state = { ...freshState(record.kind, record.key), rev: record.rev, syncedRev: record.syncedRev, loaded: true, sig: deps.signature() }
      deps.pointer.set(record.kind, record.key)
    },

    /** A different diagram is open now (new, opened or imported). Its copy starts from the stored record, if any. */
    switchTo(docId: string | null): Promise<void> {
      cancelTimer()
      pendingSince = null
      const kind = deps.getKind()
      state = freshState(kind, docId ? keyFor(kind, docId) : `${kind}:new:${randomKey()}`)
      const keep = state.key
      return enqueue(async () => {
        try {
          for (const record of await deps.store.list()) {
            if (record.key !== keep && !isDirty(record)) await deps.store.remove(record.key)
          }
        } catch { /* a few clean copies stay until next time */ }
      })
    },

    /** Drops one stored copy (after it was uploaded, or its diagram was deleted). */
    discard(kind: SafetyKind, docId: string | null, key?: string): Promise<void> {
      const target = key ?? (docId ? keyFor(kind, docId) : null)
      return enqueue(async () => {
        if (!target) return
        if (state.key === target) {
          state = freshState(state.kind, null)
          if (deps.pointer.get(kind) === target) deps.pointer.set(kind, null)
        }
        // a last-moment copy of a diagram that is gone must not bring it back
        if (emergencyMark && emergencyMark.key === target) emergencyMark = null
        try { if (deps.emergency?.read()?.key === target) deps.emergency.clear() } catch { /* ignore */ }
        try { await deps.store.remove(target) } catch { /* leftover record is harmless */ }
      })
    },

    /** Drops an uploaded leftover only if it was not edited since (its rev is still the uploaded one). */
    discardUploaded(key: string, rev: number): Promise<void> {
      return enqueue(async () => {
        if (state.key === key) return
        try {
          const current = await deps.store.get(key)
          if (current && current.rev === rev) await deps.store.remove(key)
        } catch { /* the record stays and is tried again next time */ }
      })
    },

    /** Drops every stored copy of one kind (Drive after sign-out or an account change: they belong to someone else's Drive). */
    dropKind(kind: SafetyKind): Promise<void> {
      if (state.kind === kind) {
        // the open sheet counts as stored, so the next flush does not write it straight back
        const had = state.key
        state = freshState(kind, had)
        if (had) { state.loaded = true; state.sig = deps.signature() }
      }
      if (deps.pointer.get(kind)) deps.pointer.set(kind, null)
      try { if (deps.emergency?.read()?.kind === kind) deps.emergency.clear() } catch { /* ignore */ }
      emergencyMark = null
      return enqueue(async () => {
        try {
          for (const record of await deps.store.list()) if (record.kind === kind) await deps.store.remove(record.key)
        } catch { /* leftovers are harmless but are tried again next time */ }
      })
    },

    /** The open sheet is not a diagram the person made on purpose (its diagram was deleted): do not store it unless it is edited. */
    markStored() {
      if (!state.key) return
      state.loaded = true
      state.sig = deps.signature()
    },

    /** A device-folder id changed (rename of a folder or move of a diagram): the copies follow it, exact ids and path prefixes. */
    rekey(kind: SafetyKind, fromId: string, toId: string): Promise<void> {
      if (fromId === toId) return Promise.resolve()
      const rebase = (path: string | null) => (path === fromId ? toId : path !== null && path.startsWith(`${fromId}/`) ? toId + path.slice(fromId.length) : path)
      if (state.key && state.kind === kind) {
        const current = state.key.startsWith(`${kind}:new:`) ? null : state.key.slice(kind.length + 1)
        const next = rebase(current)
        if (current !== null && next !== current && next !== null) {
          state.key = keyFor(kind, next)
          if (deps.pointer.get(kind) === keyFor(kind, current)) deps.pointer.set(kind, state.key)
          if (emergencyMark && emergencyMark.key === keyFor(kind, current)) emergencyMark = { ...emergencyMark, key: state.key }
        }
      }
      return enqueue(async () => {
        try {
          for (const record of await deps.store.list()) {
            if (record.kind !== kind) continue
            const docId = rebase(record.docId)
            const folderId = rebase(record.folderId)
            if (docId === record.docId && folderId === record.folderId) continue
            const key = record.docId !== null && docId !== null ? keyFor(kind, docId) : record.key
            if (key !== record.key) {
              const existing = await deps.store.get(key)
              if (!existing || existing.savedAt < record.savedAt) await deps.store.put({ ...record, key, docId, folderId })
              await deps.store.remove(record.key)
              if (deps.pointer.get(kind) === record.key) deps.pointer.set(kind, key)
            } else {
              await deps.store.put({ ...record, docId, folderId })
            }
          }
        } catch { /* the old record stays; it is uploaded as a leftover */ }
      })
    },

    /** A diagram was deleted: its copy must not come back. */
    forget(kind: SafetyKind, docId: string): Promise<void> {
      return this.discard(kind, docId)
    },

    /** For tests and the app: what is waiting. */
    currentKey(): string | null { return state.key },
  }
}

export type SafetyKeeper<S> = ReturnType<typeof createSafetyKeeper<S>>
