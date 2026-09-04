import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { D1CompatDatabase } from './db'
import {
  COURSE_SEARCH_INDEX_VERSION,
  loadCourseSearchIndexJsonAsync,
  type LoadedCourseSearchIndex,
  type LocalCourseSearchProvider
} from '../helpers/course-mini-search'

type IndexEntry = {
  file: string
  docCount: number
  bytes: number
  sha256: string
}

type IndexManifest = {
  schemaVersion: 1
  indexVersion: string
  generation: string
  generatedAt: string
  indexes: {
    showIcu0: IndexEntry
    showIcu1: IndexEntry
  }
}

function sha256Text(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function assertSafeFilename(value: string) {
  if (!value || path.basename(value) !== value || value.includes('..')) {
    throw new Error('unsafe search index filename')
  }
}

function assertIndexEntry(value: unknown, label: string): asserts value is IndexEntry {
  const entry = value as Partial<IndexEntry> | null
  if (
    !entry ||
    typeof entry.file !== 'string' ||
    !Number.isSafeInteger(entry.docCount) ||
    Number(entry.docCount) < 0 ||
    !Number.isSafeInteger(entry.bytes) ||
    Number(entry.bytes) <= 0 ||
    typeof entry.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(entry.sha256)
  ) {
    throw new Error(`invalid search index manifest entry: ${label}`)
  }
}

function parseManifest(raw: string): IndexManifest {
  const manifest = JSON.parse(raw) as Partial<IndexManifest>
  if (manifest.schemaVersion !== 1) {
    throw new Error(`unsupported search index manifest schema: ${String(manifest.schemaVersion)}`)
  }
  if (manifest.indexVersion !== COURSE_SEARCH_INDEX_VERSION) {
    throw new Error(`search index version mismatch: artifact=${String(manifest.indexVersion)} runtime=${COURSE_SEARCH_INDEX_VERSION}`)
  }
  if (!manifest.generation || !/^[A-Za-z0-9._-]+$/.test(manifest.generation)) {
    throw new Error('invalid search index generation')
  }
  if (!manifest.generatedAt || !Number.isFinite(Date.parse(manifest.generatedAt))) {
    throw new Error('invalid search index generatedAt')
  }
  assertIndexEntry(manifest.indexes?.showIcu0, 'showIcu0')
  assertIndexEntry(manifest.indexes?.showIcu1, 'showIcu1')
  return manifest as IndexManifest
}

export class LocalCourseSearchIndexManager {
  private readonly loaded = new Map<boolean, LoadedCourseSearchIndex>()
  private currentGeneration: string | null = null
  private requiredGeneration: string | null = null
  private lastError: string | null = null
  private generationCheckedAt = 0
  private generationCheckPromise: Promise<void> | null = null
  private reloadPromise: Promise<void> | null = null

  constructor(
    private readonly currentDir: string,
    private readonly db: D1CompatDatabase
  ) {}

  async get(showIcu: boolean): Promise<LoadedCourseSearchIndex | null> {
    await this.refreshRequiredGenerationIfNeeded()
    if (this.requiredGeneration && this.currentGeneration !== this.requiredGeneration) return null
    return this.loaded.get(showIcu) || null
  }

  getStatus() {
    const usable = this.loaded.size === 2 && (
      !this.requiredGeneration || this.requiredGeneration === this.currentGeneration
    )
    return {
      loaded: this.loaded.size === 2,
      usable,
      generation: this.currentGeneration,
      requiredGeneration: this.requiredGeneration,
      docCountShowIcu0: this.loaded.get(false)?.docCount || 0,
      docCountShowIcu1: this.loaded.get(true)?.docCount || 0,
      lastError: this.lastError
    }
  }

  invalidateGenerationCheck() {
    this.generationCheckedAt = 0
  }

  async preload() {
    await this.reload()
  }

  async reload() {
    if (this.reloadPromise) return this.reloadPromise
    const task = this.reloadInternal()
    this.reloadPromise = task
    try {
      await task
    } catch (error: any) {
      this.lastError = error?.message || 'search index reload failed'
      throw error
    } finally {
      if (this.reloadPromise === task) this.reloadPromise = null
    }
  }

  private async reloadInternal() {
    await this.refreshRequiredGeneration(true)
    const manifest = parseManifest(await fs.readFile(path.join(this.currentDir, 'manifest.json'), 'utf8'))
    const next = new Map<boolean, LoadedCourseSearchIndex>()

    for (const [showIcu, entry] of [
      [false, manifest.indexes.showIcu0],
      [true, manifest.indexes.showIcu1]
    ] as const) {
      assertSafeFilename(entry.file)
      const json = await fs.readFile(path.join(this.currentDir, entry.file), 'utf8')
      const bytes = Buffer.byteLength(json)
      if (bytes !== entry.bytes) throw new Error(`search index byte length mismatch: ${entry.file}`)
      if (sha256Text(json) !== entry.sha256) throw new Error(`search index sha256 mismatch: ${entry.file}`)

      const search = await loadCourseSearchIndexJsonAsync(json)
      next.set(showIcu, {
        search,
        builtAt: Date.parse(manifest.generatedAt),
        showIcu,
        docCount: entry.docCount,
        source: 'local',
        generation: manifest.generation
      })
    }

    // Only replace the active map after both ICU artifacts have passed all checks.
    this.loaded.clear()
    for (const [showIcu, index] of next) this.loaded.set(showIcu, index)
    this.currentGeneration = manifest.generation
    this.lastError = null
  }

  private async refreshRequiredGenerationIfNeeded() {
    if (Date.now() - this.generationCheckedAt < 5_000) return
    await this.refreshRequiredGeneration(false)
  }

  private async refreshRequiredGeneration(force: boolean) {
    if (!force && Date.now() - this.generationCheckedAt < 5_000) return
    if (this.generationCheckPromise) return this.generationCheckPromise

    const task = (async () => {
      try {
        const row = await this.db
          .prepare('SELECT value FROM settings WHERE key = ? LIMIT 1')
          .bind('course_search_required_generation')
          .first<{ value: string }>()
        this.requiredGeneration = String(row?.value || '').trim() || null
      } catch (error: any) {
        // Keep the last known generation on a transient probe failure. /readyz
        // reports DB failure independently, while search remains fail-safe.
        this.lastError = error?.message || 'failed to read required generation'
      } finally {
        this.generationCheckedAt = Date.now()
      }
    })()

    this.generationCheckPromise = task
    try {
      await task
    } finally {
      if (this.generationCheckPromise === task) this.generationCheckPromise = null
    }
  }
}

export function createLocalCourseSearchProvider(manager: LocalCourseSearchIndexManager): LocalCourseSearchProvider {
  return (showIcu) => manager.get(showIcu)
}
