'use strict'

const { test, describe } = require('node:test')
const { createClient } = require('redis')
const Fastify = require('fastify')
const rateLimit = require('../index')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const REDIS_HOST = '127.0.0.1'

// Database 1 keeps these tests isolated from the ioredis suite, which runs
// in parallel against database 0.
async function connect () {
  const redis = createClient({ socket: { host: REDIS_HOST }, database: 1 })
  await redis.connect()
  return redis
}

describe('Global rate limit', () => {
  test('With node-redis store', async (t) => {
    t.plan(15)
    const fastify = Fastify()
    const redis = await connect()
    await redis.flushDb()
    // Empty the server-side script cache so the first call exercises the
    // NOSCRIPT -> EVAL fallback and later calls the EVALSHA fast path
    await redis.scriptFlush()
    await fastify.register(rateLimit, {
      max: 2,
      timeWindow: 1000,
      redis
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
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

    res = await fastify.inject('/')
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

    // Wait for the time window to expire: the counter resets
    await sleep(1100)

    res = await fastify.inject('/')
    t.assert.deepStrictEqual(res.statusCode, 200)
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

    // The key obeys the default namespace
    const keys = await redis.keys('fastify-rate-limit-*')
    t.assert.deepStrictEqual(keys.length, 1)
    t.assert.ok(keys[0].startsWith('fastify-rate-limit-'))

    await redis.flushDb()
    redis.destroy()
  })

  test('With { increment: false } it reads the state without consuming it', async (t) => {
    t.plan(5)
    const fastify = Fastify()
    const redis = await connect()
    await redis.flushDb()
    await fastify.register(rateLimit, {
      global: false,
      max: 2,
      timeWindow: 1000,
      redis
    })

    const checkRateLimit = fastify.createRateLimit()

    fastify.get('/peek', async (req) => checkRateLimit(req, { increment: false }))
    fastify.get('/consume', async (req) => checkRateLimit(req))

    let res

    res = await fastify.inject('/peek')
    t.assert.deepStrictEqual(res.json().remaining, 2)

    res = await fastify.inject('/consume')
    t.assert.deepStrictEqual(res.json().remaining, 1)

    res = await fastify.inject('/peek')
    t.assert.deepStrictEqual(res.json().remaining, 1)

    res = await fastify.inject('/consume')
    t.assert.deepStrictEqual(res.json().remaining, 0)

    res = await fastify.inject('/peek')
    t.assert.deepStrictEqual(res.json().remaining, 0)

    await redis.flushDb()
    redis.destroy()
  })

  test('It errors when the client is closed', async (t) => {
    t.plan(2)
    const fastify = Fastify()
    const redis = await connect()
    await fastify.register(rateLimit, {
      max: 2,
      timeWindow: 1000,
      redis
    })

    fastify.get('/', async () => 'hello!')

    redis.destroy()

    const res = await fastify.inject('/')
    t.assert.deepStrictEqual(res.statusCode, 500)
    t.assert.deepStrictEqual(
      JSON.parse(res.payload).message,
      'The client is closed'
    )
  })

  test('It propagates EVAL errors from the NOSCRIPT fallback', async (t) => {
    t.plan(2)
    const fastify = Fastify()
    const redis = await connect()
    redis.evalSha = async () => { throw new Error('NOSCRIPT No matching script. Please use EVAL.') }
    redis.eval = async () => { throw new Error('eval failed') }
    await fastify.register(rateLimit, {
      max: 2,
      timeWindow: 1000,
      redis
    })

    fastify.get('/', async () => 'hello!')

    const res = await fastify.inject('/')
    t.assert.deepStrictEqual(res.statusCode, 500)
    t.assert.deepStrictEqual(JSON.parse(res.payload).message, 'eval failed')

    redis.destroy()
  })

  test('A client with neither defineCommand nor evalSha is rejected like before', async (t) => {
    t.plan(1)
    const fastify = Fastify()
    await t.assert.rejects(
      async () => {
        await fastify.register(rateLimit, {
          max: 2,
          timeWindow: 1000,
          redis: {}
        })
      },
      /defineCommand is not a function/
    )
  })
})

describe('Route rate limit', () => {
  test('With node-redis store and a custom nameSpace', async (t) => {
    t.plan(7)
    const fastify = Fastify()
    const redis = await connect()
    await redis.flushDb()
    await fastify.register(rateLimit, {
      global: false,
      redis,
      nameSpace: 'node-redis-test-'
    })

    fastify.get('/', {
      config: {
        rateLimit: {
          max: 1,
          timeWindow: 1000
        }
      }
    }, async () => 'hello!')

    let res

    res = await fastify.inject('/')
    t.assert.deepStrictEqual(res.statusCode, 200)
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

    res = await fastify.inject('/')
    t.assert.deepStrictEqual(res.statusCode, 429)
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

    // The child store prefixes keys with the namespace and route info
    const keys = await redis.keys('node-redis-test-*')
    t.assert.deepStrictEqual(keys.length, 1)
    t.assert.ok(keys[0].startsWith('node-redis-test-GET/'))

    await redis.flushDb()
    redis.destroy()
  })
})
