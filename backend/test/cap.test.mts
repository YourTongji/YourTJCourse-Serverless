import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyCapToken } from '../src/helpers/cap'

function env(extra: Record<string, string | undefined> = {}) {
  return {
    CAPTCHA_SITEVERIFY_URL: '',
    ADMIN_SECRET: '',
    CAP_API_BASE: 'https://public-cap.example',
    CAP_API_INTERNAL_BASE: 'http://cap:3000',
    CAP_SITE_KEY: 'site-key',
    CAP_SECRET_KEY: 'secret-value',
    CAP_VERIFY_TIMEOUT_MS: '1000',
    CAP_VERIFY_MAX_IN_FLIGHT: '8',
    ...extra
  } as any
}

async function withFetch(mock: typeof fetch, action: () => Promise<void>) {
  const previous = globalThis.fetch
  globalThis.fetch = mock
  try {
    await action()
  } finally {
    globalThis.fetch = previous
  }
}

test('uses internal Cap base and reports successful verification', async () => {
  let calledUrl = ''
  let requestBody: any
  let calls = 0
  await withFetch(async (input, init) => {
    calls += 1
    calledUrl = String(input)
    requestBody = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({ success: true }), { status: 200 })
  }, async () => {
    assert.deepEqual(await verifyCapToken('token-success', env()), { ok: true })
    assert.deepEqual(await verifyCapToken('token-success', env()), { ok: true })
  })

  assert.equal(calls, 1)
  assert.equal(calledUrl, 'http://cap:3000/site-key/siteverify')
  assert.deepEqual(requestBody, { secret: 'secret-value', response: 'token-success' })
})

test('coalesces concurrent verification of the same token into one siteverify request', async () => {
  let resolveResponse!: (response: Response) => void
  const response = new Promise<Response>((resolve) => { resolveResponse = resolve })
  let calls = 0

  await withFetch(() => {
    calls += 1
    return response
  }, async () => {
    const first = verifyCapToken('token-concurrent', env())
    const second = verifyCapToken('token-concurrent', env())
    await Promise.resolve()
    resolveResponse(new Response(JSON.stringify({ success: true }), { status: 200 }))
    assert.deepEqual(await first, { ok: true })
    assert.deepEqual(await second, { ok: true })
  })

  assert.equal(calls, 1)
})

test('does not retry a one-time token after an HTTP 500', async () => {
  let calls = 0
  await withFetch(async () => {
    calls += 1
    return new Response('temporary failure', { status: 500 })
  }, async () => {
    assert.deepEqual(await verifyCapToken('token-http-500', env()), {
      ok: false,
      error: 'siteverify_http_error'
    })
  })
  assert.equal(calls, 1)
})

test('classifies network errors without retrying', async () => {
  let calls = 0
  await withFetch(async () => {
    calls += 1
    throw new Error('socket reset')
  }, async () => {
    assert.deepEqual(await verifyCapToken('token-network', env()), {
      ok: false,
      error: 'unknown_error'
    })
  })
  assert.equal(calls, 1)
})

test('classifies invalid and rejected verification responses', async () => {
  await withFetch(async () => new Response('{"unexpected":true}', { status: 200 }), async () => {
    assert.deepEqual(await verifyCapToken('token-invalid', env()), {
      ok: false,
      error: 'invalid_response'
    })
  })

  await withFetch(async () => new Response(JSON.stringify({
    success: false,
    'error-codes': ['invalid-solution']
  }), { status: 200 }), async () => {
    assert.deepEqual(await verifyCapToken('token-rejected', env()), {
      ok: false,
      error: 'verify_failed',
      codes: ['invalid-solution']
    })
  })
})

test('timeout releases the slot and does not retry', async () => {
  let calls = 0
  await withFetch((_input, init) => {
    calls += 1
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const error = new Error('aborted')
        error.name = 'AbortError'
        reject(error)
      })
    })
  }, async () => {
    assert.deepEqual(await verifyCapToken('token-timeout', env()), {
      ok: false,
      error: 'timeout'
    })
  })
  assert.equal(calls, 1)
})

test('max in-flight returns busy and releases the slot after completion', async () => {
  let resolveFirst!: (response: Response) => void
  const firstResponse = new Promise<Response>((resolve) => { resolveFirst = resolve })
  let calls = 0

  await withFetch(() => {
    calls += 1
    return firstResponse
  }, async () => {
    const first = verifyCapToken('token-in-flight', env({ CAP_VERIFY_MAX_IN_FLIGHT: '1' }))
    await Promise.resolve()
    assert.deepEqual(await verifyCapToken('token-busy', env({ CAP_VERIFY_MAX_IN_FLIGHT: '1' })), {
      ok: false,
      error: 'busy'
    })
    resolveFirst(new Response(JSON.stringify({ success: true }), { status: 200 }))
    assert.deepEqual(await first, { ok: true })
  })

  assert.equal(calls, 1)
  await withFetch(async () => new Response(JSON.stringify({ success: true })), async () => {
    assert.deepEqual(await verifyCapToken('token-after-slot', env({ CAP_VERIFY_MAX_IN_FLIGHT: '1' })), { ok: true })
  })
})
