'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { GlideClient } = require('@valkey/valkey-glide')

const rateLimit = require('../index')

let fastifyValkey = null

try {
  fastifyValkey = require('@fastify/valkey-glide')
} catch {}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const VALKEY_ADDRESS = {
  host: '127.0.0.1',
  port: Number(process.env.VALKEY_PORT || 6380)
}

function createNamespace (prefix) {
  return `${prefix}${Date.now()}-${Math.random().toString(16).slice(2)}:`
}

async function createDirectValkeyClient (t) {
  const valkey = await GlideClient.createClient({
    addresses: [VALKEY_ADDRESS]
  })

  t.after(async () => {
    valkey.close()
  })

  return valkey
}

function createTestFastify (t) {
  const fastify = Fastify()

  t.after(async () => {
    await fastify.close()
  })

  return fastify
}

function assertCreateRateLimitResult (t, payload, {
  key,
  max,
  timeWindow,
  remaining,
  isExceeded,
  isBanned,
  exactTtl
}) {
  t.assert.deepStrictEqual(payload.isAllowed, false)
  t.assert.deepStrictEqual(payload.key, key)
  t.assert.deepStrictEqual(payload.max, max)
  t.assert.deepStrictEqual(payload.timeWindow, timeWindow)
  t.assert.deepStrictEqual(payload.remaining, remaining)
  t.assert.deepStrictEqual(payload.ttlInSeconds, Math.ceil(payload.ttl / 1000))
  t.assert.deepStrictEqual(payload.isExceeded, isExceeded)
  t.assert.deepStrictEqual(payload.isBanned, isBanned)

  if (exactTtl != null) {
    t.assert.ok(payload.ttl > 0 && payload.ttl <= exactTtl)
  }
}

test('With direct valkey client', async (t) => {
  t.plan(14)

  const nameSpace = createNamespace('valkey-direct-')

  const valkey = await createDirectValkeyClient(t)
  const fastify = createTestFastify(t)

  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: 1000,
    valkey,
    nameSpace,
    keyGenerator: (req) => req.headers['x-client-id']
  })

  fastify.get('/', async () => 'hello!')

  let res

  res = await fastify.inject({ url: '/', headers: { 'x-client-id': 'direct-user' } })
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  res = await fastify.inject({ url: '/', headers: { 'x-client-id': 'direct-user' } })
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject({ url: '/', headers: { 'x-client-id': 'direct-user' } })
  t.assert.deepStrictEqual(res.statusCode, 429)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['retry-after'], '1')
  t.assert.deepStrictEqual(
    {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry in 1 second'
    },
    JSON.parse(res.payload)
  )

  await sleep(1100)

  res = await fastify.inject({ url: '/', headers: { 'x-client-id': 'direct-user' } })
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
})

test('With direct valkey client and createRateLimit', async (t) => {
  const nameSpace = createNamespace('valkey-create-rate-limit-')

  const valkey = await createDirectValkeyClient(t)
  const fastify = createTestFastify(t)

  await fastify.register(rateLimit, {
    global: false,
    max: 2,
    timeWindow: 1000,
    valkey,
    nameSpace,
    keyGenerator: (req) => req.headers['x-client-id']
  })

  const checkRateLimit = fastify.createRateLimit()

  fastify.get('/', async (req) => {
    return checkRateLimit(req)
  })

  let res

  res = await fastify.inject({ url: '/', headers: { 'x-client-id': 'direct-create-user' } })
  t.assert.deepStrictEqual(res.statusCode, 200)
  assertCreateRateLimitResult(t, res.json(), {
    key: 'direct-create-user',
    max: 2,
    timeWindow: 1000,
    remaining: 1,
    isExceeded: false,
    isBanned: false,
    exactTtl: 1000
  })

  res = await fastify.inject({ url: '/', headers: { 'x-client-id': 'direct-create-user' } })
  t.assert.deepStrictEqual(res.statusCode, 200)
  assertCreateRateLimitResult(t, res.json(), {
    key: 'direct-create-user',
    max: 2,
    timeWindow: 1000,
    remaining: 0,
    isExceeded: false,
    isBanned: false,
    exactTtl: 1000
  })

  res = await fastify.inject({ url: '/', headers: { 'x-client-id': 'direct-create-user' } })
  t.assert.deepStrictEqual(res.statusCode, 200)
  assertCreateRateLimitResult(t, res.json(), {
    key: 'direct-create-user',
    max: 2,
    timeWindow: 1000,
    remaining: 0,
    isExceeded: true,
    isBanned: false,
    exactTtl: 1000
  })
})

test('With direct valkey client (ban)', async (t) => {
  t.plan(19)

  const nameSpace = createNamespace('valkey-ban-')
  const valkey = await createDirectValkeyClient(t)
  const fastify = createTestFastify(t)

  await fastify.register(rateLimit, {
    max: 1,
    ban: 1,
    timeWindow: 1000,
    valkey,
    nameSpace
  })

  fastify.get('/', async () => 'hello!')

  let res

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 429)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 403)
  t.assert.deepStrictEqual(res.headers['content-type'], 'application/json; charset=utf-8')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')
  t.assert.deepStrictEqual(res.headers['retry-after'], '1')
  t.assert.deepStrictEqual(JSON.parse(res.payload), {
    statusCode: 403,
    error: 'Forbidden',
    message: 'Rate limit exceeded, retry in 1 second'
  })

  await sleep(1100)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')
})

test('Direct valkey client with continueExceeding resets ttl only after exceeding', async (t) => {
  t.plan(19)

  const nameSpace = createNamespace('valkey-continue-exceeding-')
  const valkey = await createDirectValkeyClient(t)
  const fastify = createTestFastify(t)

  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: 5000,
    continueExceeding: true,
    valkey,
    nameSpace
  })

  fastify.get('/', async () => 'hello!')

  let res

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '5')

  await sleep(1000)

  res = await fastify.inject('/')
  const secondReset = Number(res.headers['x-ratelimit-reset'])
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.ok(secondReset >= 1 && secondReset < 5)

  res = await fastify.inject('/')
  const thirdReset = Number(res.headers['x-ratelimit-reset'])
  t.assert.deepStrictEqual(res.statusCode, 429)
  t.assert.deepStrictEqual(res.headers['content-type'], 'application/json; charset=utf-8')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.ok(thirdReset >= 4 && thirdReset <= 5)
  t.assert.deepStrictEqual(Number(res.headers['retry-after']), thirdReset)
  t.assert.deepStrictEqual(JSON.parse(res.payload), {
    statusCode: 429,
    error: 'Too Many Requests',
    message: `Rate limit exceeded, retry in ${thirdReset} seconds`
  })

  await sleep(1000)

  res = await fastify.inject('/')
  const fourthReset = Number(res.headers['x-ratelimit-reset'])
  t.assert.deepStrictEqual(res.statusCode, 429)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.ok(fourthReset >= 1 && fourthReset <= thirdReset)
})

test('With direct valkey client and exponential backoff', async (t) => {
  t.plan(20)

  const nameSpace = createNamespace('valkey-exponential-backoff-')
  const valkey = await createDirectValkeyClient(t)
  const fastify = createTestFastify(t)

  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: 1000,
    exponentialBackoff: true,
    valkey,
    nameSpace
  })

  fastify.get('/', async () => 'hello!')

  let res

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 429)
  t.assert.deepStrictEqual(res.headers['content-type'], 'application/json; charset=utf-8')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')
  t.assert.deepStrictEqual(res.headers['retry-after'], '1')
  t.assert.deepStrictEqual(JSON.parse(res.payload), {
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 1 second'
  })

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 429)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['retry-after'], '2')
  t.assert.deepStrictEqual(JSON.parse(res.payload), {
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 2 seconds'
  })
})

test('With route valkey store', async (t) => {
  t.plan(19)

  const nameSpace = createNamespace('valkey-route-')
  const valkey = await createDirectValkeyClient(t)
  const fastify = createTestFastify(t)

  await fastify.register(rateLimit, {
    global: false,
    valkey,
    nameSpace
  })

  fastify.get('/', {
    config: {
      rateLimit: {
        max: 2,
        timeWindow: 1000
      },
      someOtherPlugin: {
        someValue: 1
      }
    }
  }, async () => 'hello!')

  let res

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 429)
  t.assert.deepStrictEqual(res.headers['content-type'], 'application/json; charset=utf-8')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')
  t.assert.deepStrictEqual(res.headers['retry-after'], '1')
  t.assert.deepStrictEqual(JSON.parse(res.payload), {
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 1 second'
  })

  await sleep(1100)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')
})

test('When continue exceeding is off under route (Valkey)', async (t) => {
  t.plan(8)

  const nameSpace = createNamespace('valkey-route-continue-exceeding-')
  const valkey = await createDirectValkeyClient(t)
  const fastify = createTestFastify(t)

  await fastify.register(rateLimit, {
    global: false,
    continueExceeding: true,
    valkey,
    nameSpace
  })

  fastify.get('/', {
    config: {
      rateLimit: {
        timeWindow: 5000,
        max: 1,
        continueExceeding: false
      }
    }
  }, async () => 'hello!')

  const first = await fastify.inject({ url: '/', method: 'GET' })
  const second = await fastify.inject({ url: '/', method: 'GET' })

  await sleep(1000)

  const third = await fastify.inject({ url: '/', method: 'GET' })
  const secondReset = Number(second.headers['x-ratelimit-reset'])
  const thirdReset = Number(third.headers['x-ratelimit-reset'])

  t.assert.deepStrictEqual(first.statusCode, 200)
  t.assert.deepStrictEqual(second.statusCode, 429)
  t.assert.deepStrictEqual(second.headers['x-ratelimit-limit'], '1')
  t.assert.deepStrictEqual(second.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(second.headers['x-ratelimit-reset'], '5')
  t.assert.deepStrictEqual(third.statusCode, 429)
  t.assert.deepStrictEqual(third.headers['x-ratelimit-remaining'], '0')
  t.assert.ok(thirdReset >= 1 && thirdReset < secondReset)
})

test('Route-specific exponential backoff with valkey store', async (t) => {
  t.plan(17)

  const nameSpace = createNamespace('valkey-route-exponential-backoff-')
  const valkey = await createDirectValkeyClient(t)
  const fastify = createTestFastify(t)

  await fastify.register(rateLimit, {
    global: false,
    valkey,
    nameSpace
  })

  fastify.get('/', {
    config: {
      rateLimit: {
        max: 1,
        timeWindow: 1000,
        exponentialBackoff: true
      }
    }
  }, async () => 'hello!')

  let res

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 429)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['retry-after'], '1')
  t.assert.deepStrictEqual(JSON.parse(res.payload), {
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 1 second'
  })

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 429)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['retry-after'], '2')
  t.assert.deepStrictEqual(JSON.parse(res.payload), {
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 2 seconds'
  })

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 429)
  t.assert.deepStrictEqual(res.headers['retry-after'], '4')
  t.assert.deepStrictEqual(JSON.parse(res.payload), {
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 4 seconds'
  })
})

const managedValkeyTest = fastifyValkey ? test : test.skip

managedValkeyTest('With managed @fastify/valkey-glide client and createRateLimit', async (t) => {
  const nameSpace = createNamespace('valkey-managed-')

  const fastify = createTestFastify(t)

  await fastify.register(fastifyValkey, {
    namespace: 'rateLimit',
    addresses: [VALKEY_ADDRESS]
  })

  await fastify.register(rateLimit, {
    global: false,
    max: 2,
    timeWindow: 1000,
    valkey: fastify.valkey.rateLimit,
    nameSpace,
    keyGenerator: (req) => req.headers['x-client-id']
  })

  const checkRateLimit = fastify.createRateLimit()

  fastify.get('/', async (req) => {
    return checkRateLimit(req)
  })

  let res

  res = await fastify.inject({ url: '/', headers: { 'x-client-id': 'managed-user' } })
  t.assert.deepStrictEqual(res.statusCode, 200)
  assertCreateRateLimitResult(t, res.json(), {
    key: 'managed-user',
    max: 2,
    timeWindow: 1000,
    remaining: 1,
    isExceeded: false,
    isBanned: false,
    exactTtl: 1000
  })

  res = await fastify.inject({ url: '/', headers: { 'x-client-id': 'managed-user' } })
  t.assert.deepStrictEqual(res.statusCode, 200)
  assertCreateRateLimitResult(t, res.json(), {
    key: 'managed-user',
    max: 2,
    timeWindow: 1000,
    remaining: 0,
    isExceeded: false,
    isBanned: false,
    exactTtl: 1000
  })

  res = await fastify.inject({ url: '/', headers: { 'x-client-id': 'managed-user' } })
  t.assert.deepStrictEqual(res.statusCode, 200)
  assertCreateRateLimitResult(t, res.json(), {
    key: 'managed-user',
    max: 2,
    timeWindow: 1000,
    remaining: 0,
    isExceeded: true,
    isBanned: false,
    exactTtl: 1000
  })
})
