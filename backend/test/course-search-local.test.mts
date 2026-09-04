import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import MiniSearch from 'minisearch'
import {
  COURSE_SEARCH_INDEX_VERSION,
  miniSearchOptions,
  type MiniCourseDocument
} from '../src/helpers/course-mini-search'
import { LocalCourseSearchIndexManager } from '../src/runtime/course-search-local'
import type { D1CompatDatabase } from '../src/runtime/db'

function doc(id: number, name: string): MiniCourseDocument {
  return {
    id: `course:${id}`,
    courseId: id,
    code: `C${id}`,
    name,
    teacherName: '',
    teacherCode: '',
    department: '测试单位',
    aliases: '',
    semesters: ''
  }
}

function serialized(documents: MiniCourseDocument[]) {
  const search = new MiniSearch<MiniCourseDocument>(miniSearchOptions)
  search.addAll(documents)
  return JSON.stringify(search.toJSON())
}

function fakeDb(getRequiredGeneration: () => string | null) {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => {
          const value = getRequiredGeneration()
          return value ? { value } : null
        }
      })
    })
  } as unknown as D1CompatDatabase
}

async function createGeneration(root: string, generation: string) {
  const showIcu0 = serialized([doc(1, '普通数学')])
  const showIcu1 = serialized([doc(2, 'ICU 数学')])
  const entry = (file: string, json: string) => ({
    file,
    docCount: 1,
    bytes: Buffer.byteLength(json),
    sha256: createHash('sha256').update(json).digest('hex')
  })

  await writeFile(path.join(root, 'show-icu-0.json'), showIcu0)
  await writeFile(path.join(root, 'show-icu-1.json'), showIcu1)
  await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify({
    schemaVersion: 1,
    indexVersion: COURSE_SEARCH_INDEX_VERSION,
    generation,
    generatedAt: new Date().toISOString(),
    indexes: {
      showIcu0: entry('show-icu-0.json', showIcu0),
      showIcu1: entry('show-icu-1.json', showIcu1)
    }
  })}\n`)
}

test('local manager atomically loads both ICU artifacts and enforces required generation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jcourse-search-'))
  try {
    let required: string | null = 'gen-a'
    await createGeneration(root, 'gen-a')
    const manager = new LocalCourseSearchIndexManager(root, fakeDb(() => required))

    await manager.preload()
    assert.deepEqual(manager.getStatus(), {
      loaded: true,
      usable: true,
      generation: 'gen-a',
      requiredGeneration: 'gen-a',
      docCountShowIcu0: 1,
      docCountShowIcu1: 1,
      lastError: null
    })
    assert.deepEqual((await manager.get(false))?.search.search('普通数学').map((item) => item.id), ['course:1'])

    required = 'gen-b'
    manager.invalidateGenerationCheck()
    assert.equal(await manager.get(false), null)
    assert.equal(manager.getStatus().usable, false)
    assert.equal(manager.getStatus().generation, 'gen-a')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('failed reload preserves the previously active complete generation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jcourse-search-'))
  try {
    await createGeneration(root, 'gen-a')
    const manager = new LocalCourseSearchIndexManager(root, fakeDb(() => 'gen-a'))
    await manager.preload()
    const oldIndex = await manager.get(false)

    await writeFile(path.join(root, 'show-icu-1.json'), '{broken')
    await assert.rejects(() => manager.reload(), /byte length mismatch|sha256 mismatch|JSON|MiniSearch/)

    assert.equal(manager.getStatus().generation, 'gen-a')
    assert.equal(manager.getStatus().loaded, true)
    assert.equal((await manager.get(false))?.search, oldIndex?.search)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('missing artifact starts degraded without throwing from the manager status path', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jcourse-search-'))
  try {
    const manager = new LocalCourseSearchIndexManager(root, fakeDb(() => null))
    await assert.rejects(() => manager.preload(), /ENOENT|no such file/i)
    assert.equal(manager.getStatus().loaded, false)
    assert.equal(manager.getStatus().usable, false)
    assert.equal(await manager.get(false), null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
