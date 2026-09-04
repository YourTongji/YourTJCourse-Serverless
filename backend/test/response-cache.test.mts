import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clearProcessResponseCache,
  getProcessResponseCache,
  installProcessResponseCache,
  ProcessResponseCache
} from '../src/helpers/cache.ts'

test('stores and returns a public response without consuming the original', async () => {
  let now = 1_000
  const cache = new ProcessResponseCache({ now: () => now })
  const original = new Response('cached body', {
    status: 201,
    headers: {
      'Cache-Control': 'public, max-age=10',
      'X-Test': 'kept'
    }
  })

  await cache.put('key', original)
  const hit = await cache.match('key')

  assert.ok(hit)
  assert.equal(hit.status, 201)
  assert.equal(hit.headers.get('X-Test'), 'kept')
  assert.equal(await hit.text(), 'cached body')
  assert.equal(await original.text(), 'cached body')
  assert.deepEqual(cache.getStats(), { entries: 1, bytes: 11 })
})

test('expires entries and skips private or no-store responses', async () => {
  let now = 2_000
  const cache = new ProcessResponseCache({ now: () => now })

  await cache.put('private', new Response('private', {
    headers: { 'Cache-Control': 'private, max-age=30' }
  }))
  await cache.put('no-store', new Response('no-store', {
    headers: { 'Cache-Control': 'public, no-store, max-age=30' }
  }))
  assert.equal(await cache.match('private'), null)
  assert.equal(await cache.match('no-store'), null)

  await cache.put('expires', new Response('expires', {
    headers: { 'Cache-Control': 'public, max-age=1' }
  }))
  now += 1_000
  assert.equal(await cache.match('expires'), null)
})

test('evicts least recently used entries and rejects oversized bodies', async () => {
  const cache = new ProcessResponseCache({ maxEntries: 2, maxBytes: 5 })
  const response = (body: string) => new Response(body, {
    headers: { 'Cache-Control': 'public, max-age=60' }
  })

  await cache.put('too-large', response('123456'))
  await cache.put('a', response('a'))
  await cache.put('b', response('b'))
  assert.ok(await cache.match('a'))
  await cache.put('c', response('c'))

  assert.ok(await cache.match('a'))
  assert.equal(await cache.match('b'), null)
  assert.ok(await cache.match('c'))
  assert.deepEqual(cache.getStats(), { entries: 2, bytes: 2 })
})

test('clear removes all entries', async () => {
  const cache = new ProcessResponseCache()
  await cache.put('key', new Response('value', {
    headers: { 'Cache-Control': 'public, max-age=60' }
  }))

  cache.clear()
  assert.equal(await cache.match('key'), null)
  assert.deepEqual(cache.getStats(), { entries: 0, bytes: 0 })
})

test('global process cache can be cleared at a runtime invalidation boundary', async () => {
  const cache = installProcessResponseCache({ maxEntries: 2 })
  await cache.put('key', new Response('value', {
    headers: { 'Cache-Control': 'public, max-age=60' }
  }))

  assert.equal(getProcessResponseCache(), cache)
  clearProcessResponseCache()
  assert.equal(await cache.match('key'), null)
})
