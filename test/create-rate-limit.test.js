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
