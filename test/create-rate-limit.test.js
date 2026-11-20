'use strict'

const { test, mock } = require('node:test')
const Fastify = require('fastify')
const rateLimit = require('../index')

test('With global rate limit options', async t => {
  t.plan(8)
  const clock = mock.timers
  clock.enable(0)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    max: 2,
    timeWindow: 1000
  })

  const checkRateLimit = fastify.createRateLimit()

  fastify.get('/', async (req, reply) => {
    const limit = await checkRateLimit(req)
    return limit
  })

  let res

  res = await fastify.inject('/')

  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: false,
    key: '127.0.0.1',
    max: 2,
    timeWindow: 1000,
    remaining: 1,
    ttl: 1000,
    ttlInSeconds: 1,
    isExceeded: false,
    isBanned: false
  })

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: false,
    key: '127.0.0.1',
    max: 2,
    timeWindow: 1000,
    remaining: 0,
    ttl: 1000,
    ttlInSeconds: 1,
    isExceeded: false,
    isBanned: false
  })

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: false,
    key: '127.0.0.1',
    max: 2,
    timeWindow: 1000,
    remaining: 0,
    ttl: 1000,
    ttlInSeconds: 1,
    isExceeded: true,
    isBanned: false
  })

  clock.tick(1100)

  res = await fastify.inject('/')

  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: false,
    key: '127.0.0.1',
    max: 2,
    timeWindow: 1000,
    remaining: 1,
    ttl: 1000,
    ttlInSeconds: 1,
    isExceeded: false,
    isBanned: false
  })

  clock.reset()
})

test('With custom rate limit options', async t => {
  t.plan(10)
  const clock = mock.timers
  clock.enable(0)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    max: 5,
    timeWindow: 1000
  })

  const checkRateLimit = fastify.createRateLimit({
    max: 2,
    timeWindow: 1000,
    ban: 1
  })

  fastify.get('/', async (req, reply) => {
    const limit = await checkRateLimit(req)
    return limit
  })

  let res

  res = await fastify.inject('/')

  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: false,
    key: '127.0.0.1',
    max: 2,
    timeWindow: 1000,
    remaining: 1,
    ttl: 1000,
    ttlInSeconds: 1,
    isExceeded: false,
    isBanned: false
  })

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: false,
    key: '127.0.0.1',
    max: 2,
    timeWindow: 1000,
    remaining: 0,
    ttl: 1000,
    ttlInSeconds: 1,
    isExceeded: false,
    isBanned: false
  })

  // should be exceeded now
  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: false,
    key: '127.0.0.1',
    max: 2,
    timeWindow: 1000,
    remaining: 0,
    ttl: 1000,
    ttlInSeconds: 1,
    isExceeded: true,
    isBanned: false
  })

  // should be banned now
  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: false,
    key: '127.0.0.1',
    max: 2,
    timeWindow: 1000,
    remaining: 0,
    ttl: 1000,
    ttlInSeconds: 1,
    isExceeded: true,
    isBanned: true
  })

  clock.tick(1100)

  res = await fastify.inject('/')

  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: false,
    key: '127.0.0.1',
    max: 2,
    timeWindow: 1000,
    remaining: 1,
    ttl: 1000,
    ttlInSeconds: 1,
    isExceeded: false,
    isBanned: false
  })

  clock.reset()
})

test('With allow list', async t => {
  t.plan(2)
  const clock = mock.timers
  clock.enable(0)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    max: 5,
    timeWindow: 1000
  })

  const checkRateLimit = fastify.createRateLimit({
    allowList: ['127.0.0.1'],
    max: 2,
    timeWindow: 1000
  })

  fastify.get('/', async (req, reply) => {
    const limit = await checkRateLimit(req)
    return limit
  })

  const res = await fastify.inject('/')

  t.assert.deepStrictEqual(res.statusCode, 200)

  // expect a different return type because isAllowed is true
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: true,
    key: '127.0.0.1'
  })

  clock.reset()
})

test('With { increment: false } it reads the state without consuming it', async t => {
  t.plan(10)
  const clock = mock.timers
  clock.enable(0)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    max: 2,
    timeWindow: 1000
  })

  const checkRateLimit = fastify.createRateLimit()

  fastify.get('/peek', async (req) => checkRateLimit(req, { increment: false }))
  fastify.get('/consume', async (req) => checkRateLimit(req))

  let res

  // Peek before any request: clean state, nothing consumed
  res = await fastify.inject('/peek')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: false,
    key: '127.0.0.1',
    max: 2,
    timeWindow: 1000,
    remaining: 2,
    ttl: 0,
    ttlInSeconds: 0,
    isExceeded: false,
    isBanned: false
  })

  // Consume one request
  res = await fastify.inject('/consume')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: false,
    key: '127.0.0.1',
    max: 2,
    timeWindow: 1000,
    remaining: 1,
    ttl: 1000,
    ttlInSeconds: 1,
    isExceeded: false,
    isBanned: false
  })

  // Peek again: reads the active window without consuming (remaining stays 1)
  res = await fastify.inject('/peek')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: false,
    key: '127.0.0.1',
    max: 2,
    timeWindow: 1000,
    remaining: 1,
    ttl: 1000,
    ttlInSeconds: 1,
    isExceeded: false,
    isBanned: false
  })

  // Consume again: now the limit is reached
  res = await fastify.inject('/consume')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: false,
    key: '127.0.0.1',
    max: 2,
    timeWindow: 1000,
    remaining: 0,
    ttl: 1000,
    ttlInSeconds: 1,
    isExceeded: false,
    isBanned: false
  })

  // After the window expires, peek reports a clean state again
  clock.tick(1100)

  res = await fastify.inject('/peek')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: false,
    key: '127.0.0.1',
    max: 2,
    timeWindow: 1000,
    remaining: 2,
    ttl: 0,
    ttlInSeconds: 0,
    isExceeded: false,
    isBanned: false
  })

  clock.reset()
})

test('With { increment: false } and continueExceeding the peek mirrors the active window', async t => {
  t.plan(4)
  const clock = mock.timers
  clock.enable(0)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    max: 1,
    timeWindow: 1000,
    continueExceeding: true
  })

  const checkRateLimit = fastify.createRateLimit()
  fastify.get('/peek', async (req) => checkRateLimit(req, { increment: false }))
  fastify.get('/consume', async (req) => checkRateLimit(req))

  let res

  await fastify.inject('/consume') // current = 1
  clock.tick(100)
  await fastify.inject('/consume') // current = 2 -> continueExceeding resets the window
  clock.tick(100)

  // Peek inside the active window: shows the exceeded state, does not reset it
  res = await fastify.inject('/peek')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: false,
    key: '127.0.0.1',
    max: 1,
    timeWindow: 1000,
    remaining: 0,
    ttl: 900,
    ttlInSeconds: 1,
    isExceeded: true,
    isBanned: false
  })

  // Once the window elapses, the peek reports a clean state again (matching incr)
  clock.tick(1000)
  res = await fastify.inject('/peek')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: false,
    key: '127.0.0.1',
    max: 1,
    timeWindow: 1000,
    remaining: 1,
    ttl: 0,
    ttlInSeconds: 0,
    isExceeded: false,
    isBanned: false
  })

  clock.reset()
})

test('With { increment: false } and exponentialBackoff the peek reports the base window without escalating it', async t => {
  t.plan(4)
  const clock = mock.timers
  clock.enable(0)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    max: 1,
    timeWindow: 1000,
    exponentialBackoff: true
  })

  const checkRateLimit = fastify.createRateLimit()
  fastify.get('/peek', async (req) => checkRateLimit(req, { increment: false }))
  fastify.get('/consume', async (req) => checkRateLimit(req))

  let res

  await fastify.inject('/consume') // current = 1
  clock.tick(100)
  await fastify.inject('/consume') // current = 2 -> backoff window doubles
  clock.tick(100)
  await fastify.inject('/consume') // current = 3 -> backoff window doubles again
  clock.tick(100)

  // Peek reports the current count and the base-window ttl, without escalating
  // the backoff window the way a real (incrementing) request would.
  res = await fastify.inject('/peek')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: false,
    key: '127.0.0.1',
    max: 1,
    timeWindow: 1000,
    remaining: 0,
    ttl: 900,
    ttlInSeconds: 1,
    isExceeded: true,
    isBanned: false
  })

  // Once the base window elapses, the peek reports a clean state
  clock.tick(1000)
  res = await fastify.inject('/peek')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: false,
    key: '127.0.0.1',
    max: 1,
    timeWindow: 1000,
    remaining: 1,
    ttl: 0,
    ttlInSeconds: 0,
    isExceeded: false,
    isBanned: false
  })

  clock.reset()
})

test('With { increment: false } it throws a clear error when the store has no read method', async t => {
  t.plan(2)

  class NoReadStore {
    incr (ip, cb, timeWindow) {
      cb(null, { current: 1, ttl: timeWindow })
    }

    child () {
      return this
    }
  }

  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    max: 2,
    timeWindow: 1000,
    store: NoReadStore
  })

  const checkRateLimit = fastify.createRateLimit()
  fastify.get('/peek', async (req) => checkRateLimit(req, { increment: false }))

  const res = await fastify.inject('/peek')
  t.assert.deepStrictEqual(res.statusCode, 500)
  t.assert.ok(res.json().message.includes('read'))
})

test('With { increment: false } it reports isExceeded when the counter is at max (off-by-one fix)', async t => {
  t.plan(1)
  const clock = mock.timers
  clock.enable(0)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    max: 2,
    timeWindow: 1000
  })

  const checkRateLimit = fastify.createRateLimit()
  fastify.get('/peek', async (req) => checkRateLimit(req, { increment: false }))
  fastify.get('/consume', async (req) => checkRateLimit(req))

  // Reach exactly `max` (current === 2)
  await fastify.inject('/consume')
  await fastify.inject('/consume')

  // A peek gates a request that has not been counted yet, so it is exceeded
  // as soon as current equals max (previously it allowed max + 1).
  const res = await fastify.inject('/peek')
  t.assert.deepStrictEqual(res.json().isExceeded, true)

  clock.reset()
})

test('With { refund: true } it gives back a previously consumed slot', async t => {
  t.plan(12)
  const clock = mock.timers
  clock.enable(0)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    max: 2,
    timeWindow: 1000
  })

  const checkRateLimit = fastify.createRateLimit()
  fastify.get('/consume', async (req) => checkRateLimit(req))
  fastify.get('/refund', async (req) => checkRateLimit(req, { refund: true }))

  let res

  res = await fastify.inject('/consume')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json().remaining, 1)

  res = await fastify.inject('/consume')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json().remaining, 0)

  // Refund gives the slot back
  res = await fastify.inject('/refund')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json().remaining, 1)

  res = await fastify.inject('/refund')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json().remaining, 2)

  // Refund never goes below zero
  res = await fastify.inject('/refund')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json().remaining, 2)

  // After the window expires, refund reports a clean state
  clock.tick(1100)
  res = await fastify.inject('/refund')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json().remaining, 2)

  clock.reset()
})

test('With { refund: true } the consume-then-refund login flow is not bypassed by concurrency', async t => {
  t.plan(3)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    max: 2,
    timeWindow: 1000
  })

  const checkRateLimit = fastify.createRateLimit()

  let attempts = 0
  let resolveGate
  const gate = new Promise(resolve => { resolveGate = resolve })

  fastify.post('/login', async (req, reply) => {
    // Reserve a slot atomically
    const limit = await checkRateLimit(req)
    if (limit.isExceeded) {
      return reply.code(429).send({ error: 'Too many attempts' })
    }

    // Simulate a slow async operation (password hash / DB)
    await gate
    attempts++

    if (req.body.password !== 'correct') {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    // Give the reserved slot back on success
    await checkRateLimit(req, { refund: true })
    return { ok: true }
  })

  const N = 50
  const pending = []
  for (let i = 0; i < N; i++) {
    pending.push(fastify.inject({
      method: 'POST',
      url: '/login',
      payload: { password: 'wrong-' + i }
    }))
  }

  setTimeout(resolveGate, 100)
  const results = await Promise.all(pending)
  const statuses = results.reduce((acc, r) => { acc[r.statusCode] = (acc[r.statusCode] || 0) + 1; return acc }, {})

  // Only `max` attempts should reach the password check, despite the burst
  t.assert.deepStrictEqual(attempts, 2)
  t.assert.deepStrictEqual(statuses[401], 2)
  t.assert.deepStrictEqual(statuses[429], N - 2)
})

test('With { refund: true } it throws a clear error when the store has no decr method', async t => {
  t.plan(2)

  class NoDecrStore {
    incr (ip, cb, timeWindow) {
      cb(null, { current: 1, ttl: timeWindow })
    }

    read (ip, cb) {
      cb(null, { current: 0, ttl: 0 })
    }

    child () {
      return this
    }
  }

  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    max: 2,
    timeWindow: 1000,
    store: NoDecrStore
  })

  const checkRateLimit = fastify.createRateLimit()
  fastify.get('/refund', async (req) => checkRateLimit(req, { refund: true }))

  const res = await fastify.inject('/refund')
  t.assert.deepStrictEqual(res.statusCode, 500)
  t.assert.ok(res.json().message.includes('decr'))
})
