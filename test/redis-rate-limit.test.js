'use strict'

const { describe } = require('node:test')
const tap = require('tap')
const assert = require('node:assert')
const Redis = require('ioredis')
const Fastify = require('fastify')
const rateLimit = require('../index')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const REDIS_HOST = '127.0.0.1'

describe('Global rate limit', () => {
  tap.test('With redis store', async (t) => {
    t.plan(21)
    const fastify = Fastify()
    const redis = await new Redis({ host: REDIS_HOST })
    await fastify.register(rateLimit, {
      max: 2,
      timeWindow: 1000,
      redis
    })

    fastify.get('/', async (req, reply) => 'hello!')

    let res

    res = await fastify.inject('/')
    assert.strictEqual(res.statusCode, 200)
    assert.ok(res)
    assert.strictEqual(res.statusCode, 200)
    assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
    assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

    res = await fastify.inject('/')
    assert.deepStrictEqual(res.statusCode, 200)
    assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
    assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

    await sleep(100)

    res = await fastify.inject('/')
    assert.deepStrictEqual(res.statusCode, 429)
    assert.deepStrictEqual(
      res.headers['content-type'],
      'application/json; charset=utf-8'
    )
    assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
    assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')
    assert.deepStrictEqual(res.headers['retry-after'], '1')
    assert.deepStrictEqual(
      {
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded, retry in 1 second'
      },
      JSON.parse(res.payload)
    )

    // Not using fake timers here as we use an external Redis that would not be effected by this
    await sleep(1100)

    res = await fastify.inject('/')

    assert.deepStrictEqual(res.statusCode, 200)
    assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
    assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

    await redis.flushall()
    await redis.quit()
  })

  tap.test('With redis store (ban)', async (t) => {
    t.plan(19)
    const fastify = Fastify()
    const redis = await new Redis({ host: REDIS_HOST })
    await fastify.register(rateLimit, {
      max: 1,
      ban: 1,
      timeWindow: 1000,
      redis
    })

    fastify.get('/', async (req, reply) => 'hello!')

    let res

    res = await fastify.inject('/')
    assert.deepStrictEqual(res.statusCode, 200)
    assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
    assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
    assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

    res = await fastify.inject('/')
    assert.deepStrictEqual(res.statusCode, 429)
    assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
    assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
    assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

    res = await fastify.inject('/')
    assert.deepStrictEqual(res.statusCode, 403)
    assert.deepStrictEqual(
      res.headers['content-type'],
      'application/json; charset=utf-8'
    )
    assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
    assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
    assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')
    assert.deepStrictEqual(res.headers['retry-after'], '1')
    assert.deepStrictEqual(
      {
        statusCode: 403,
        error: 'Forbidden',
        message: 'Rate limit exceeded, retry in 1 second'
      },
      JSON.parse(res.payload)
    )

    // Not using fake timers here as we use an external Redis that would not be effected by this
    await sleep(1100)

    res = await fastify.inject('/')

    assert.deepStrictEqual(res.statusCode, 200)
    assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
    assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
    assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

    await redis.flushall()
    await redis.quit()
  })

  tap.test('Skip on redis error', async (t) => {
    t.plan(9)
    const fastify = Fastify()
    const redis = await new Redis({ host: REDIS_HOST })
    await fastify.register(rateLimit, {
      max: 2,
      timeWindow: 1000,
      redis,
      skipOnError: true
    })

    fastify.get('/', async (req, reply) => 'hello!')

    let res

    res = await fastify.inject('/')
    assert.deepStrictEqual(res.statusCode, 200)
    assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

    await redis.flushall()
    await redis.quit()

    res = await fastify.inject('/')
    assert.deepStrictEqual(res.statusCode, 200)
    assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '2')

    res = await fastify.inject('/')
    assert.deepStrictEqual(res.statusCode, 200)
    assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '2')
  })

  tap.test('Throw on redis error', async (t) => {
    t.plan(5)
    const fastify = Fastify()
    const redis = await new Redis({ host: REDIS_HOST })
    await fastify.register(rateLimit, {
      max: 2,
      timeWindow: 1000,
      redis,
      skipOnError: false
    })

    fastify.get('/', async (req, reply) => 'hello!')

    let res

    res = await fastify.inject('/')
    assert.deepStrictEqual(res.statusCode, 200)
    assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

    await redis.flushall()
    await redis.quit()

    res = await fastify.inject('/')
    assert.deepStrictEqual(res.statusCode, 500)
    assert.deepStrictEqual(
      res.body,
      '{"statusCode":500,"error":"Internal Server Error","message":"Connection is closed."}'
    )
  })

  tap.test('When continue exceeding is on (Redis)', async (t) => {
    const fastify = Fastify()
    const redis = await new Redis({ host: REDIS_HOST })

    await fastify.register(rateLimit, {
      redis,
      max: 1,
      timeWindow: 5000,
      continueExceeding: true
    })

    fastify.get('/', async (req, reply) => 'hello!')

    const first = await fastify.inject({
      url: '/',
      method: 'GET'
    })
    const second = await fastify.inject({
      url: '/',
      method: 'GET'
    })

    assert.deepStrictEqual(first.statusCode, 200)

    assert.deepStrictEqual(second.statusCode, 429)
    assert.deepStrictEqual(second.headers['x-ratelimit-limit'], '1')
    assert.deepStrictEqual(second.headers['x-ratelimit-remaining'], '0')
    assert.deepStrictEqual(second.headers['x-ratelimit-reset'], '5')

    await redis.flushall()
    await redis.quit()
  })

  tap.test('Redis with continueExceeding should not always return the timeWindow as ttl', async (t) => {
    t.plan(19)
    const fastify = Fastify()
    const redis = await new Redis({ host: REDIS_HOST })
    await fastify.register(rateLimit, {
      max: 2,
      timeWindow: 3000,
      continueExceeding: true,
      redis
    })

    fastify.get('/', async (req, reply) => 'hello!')

    let res

    res = await fastify.inject('/')
    assert.deepStrictEqual(res.statusCode, 200)
    assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
    assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '3')

    // After this sleep, we should not see `x-ratelimit-reset === 3` anymore
    await sleep(1000)

    res = await fastify.inject('/')
    assert.deepStrictEqual(res.statusCode, 200)
    assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
    assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '2')

    res = await fastify.inject('/')
    assert.deepStrictEqual(res.statusCode, 429)
    assert.deepStrictEqual(
      res.headers['content-type'],
      'application/json; charset=utf-8'
    )
    assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
    assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '3')
    assert.deepStrictEqual(res.headers['retry-after'], '3')
    assert.deepStrictEqual(
      {
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded, retry in 3 seconds'
      },
      JSON.parse(res.payload)
    )

    // Not using fake timers here as we use an external Redis that would not be effected by this
    await sleep(1000)

    res = await fastify.inject('/')

    assert.deepStrictEqual(res.statusCode, 429)
    assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
    assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '3')

    await redis.flushall()
    await redis.quit()
  })

  tap.test('When use a custom nameSpace', async (t) => {
    const fastify = Fastify()
    const redis = await new Redis({ host: REDIS_HOST })

    await fastify.register(rateLimit, {
      max: 2,
      timeWindow: 1000,
      redis,
      nameSpace: 'my-namespace:',
      keyGenerator: (req) => req.headers['x-my-header']
    })

    fastify.get('/', async (req, reply) => 'hello!')

    const allowListHeader = {
      method: 'GET',
      url: '/',
      headers: {
        'x-my-header': 'custom name space'
      }
    }

    let res

    res = await fastify.inject(allowListHeader)
    assert.deepStrictEqual(res.statusCode, 200)
    assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
    assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

    res = await fastify.inject(allowListHeader)
    assert.deepStrictEqual(res.statusCode, 200)
    assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
    assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

    res = await fastify.inject(allowListHeader)
    assert.deepStrictEqual(res.statusCode, 429)
    assert.deepStrictEqual(
      res.headers['content-type'],
      'application/json; charset=utf-8'
    )
    assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
    assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')
    assert.deepStrictEqual(res.headers['retry-after'], '1')
    assert.deepStrictEqual(
      {
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded, retry in 1 second'
      },
      JSON.parse(res.payload)
    )

    // Not using fake timers here as we use an external Redis that would not be effected by this
    await sleep(1100)

    res = await fastify.inject(allowListHeader)

    assert.deepStrictEqual(res.statusCode, 200)
    assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
    assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

    await redis.flushall()
    await redis.quit()
  })
})

describe('Route rate limit', () => {
  tap.test('With redis store', async t => {
    t.plan(19)
    const fastify = Fastify()
    const redis = new Redis({ host: REDIS_HOST })
    await fastify.register(rateLimit, {
      global: false,
      redis
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
    }, async (req, reply) => 'hello!')

    let res

    res = await fastify.inject('/')
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.headers['x-ratelimit-limit'], '2')
    assert.strictEqual(res.headers['x-ratelimit-remaining'], '1')
    assert.strictEqual(res.headers['x-ratelimit-reset'], '1')

    res = await fastify.inject('/')
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.headers['x-ratelimit-limit'], '2')
    assert.strictEqual(res.headers['x-ratelimit-remaining'], '0')
    assert.strictEqual(res.headers['x-ratelimit-reset'], '1')

    res = await fastify.inject('/')
    assert.strictEqual(res.statusCode, 429)
    assert.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8')
    assert.strictEqual(res.headers['x-ratelimit-limit'], '2')
    assert.strictEqual(res.headers['x-ratelimit-remaining'], '0')
    assert.strictEqual(res.headers['x-ratelimit-reset'], '1')
    assert.strictEqual(res.headers['retry-after'], '1')
    assert.deepStrictEqual({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry in 1 second'
    }, JSON.parse(res.payload))

    // Not using fake timers here as we use an external Redis that would not be effected by this
    await sleep(1100)

    res = await fastify.inject('/')
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.headers['x-ratelimit-limit'], '2')
    assert.strictEqual(res.headers['x-ratelimit-remaining'], '1')
    assert.strictEqual(res.headers['x-ratelimit-reset'], '1')

    await redis.flushall()
    await redis.quit()
  })

  tap.test('Throw on redis error', async (t) => {
    t.plan(6)
    const fastify = Fastify()
    const redis = new Redis({ host: REDIS_HOST })
    await fastify.register(rateLimit, {
      redis,
      global: false
    })

    fastify.get(
      '/',
      {
        config: {
          rateLimit: {
            max: 2,
            timeWindow: 1000,
            skipOnError: false
          }
        }
      },
      async (req, reply) => 'hello!'
    )

    let res

    res = await fastify.inject('/')
    assert.deepStrictEqual(res.statusCode, 200)
    assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
    assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

    await redis.flushall()
    await redis.quit()

    res = await fastify.inject('/')
    assert.deepStrictEqual(res.statusCode, 500)
    assert.deepStrictEqual(
      res.body,
      '{"statusCode":500,"error":"Internal Server Error","message":"Connection is closed."}'
    )
  })

  tap.test('Skip on redis error', async (t) => {
    t.plan(9)
    const fastify = Fastify()
    const redis = new Redis({ host: REDIS_HOST })
    await fastify.register(rateLimit, {
      redis,
      global: false
    })

    fastify.get(
      '/',
      {
        config: {
          rateLimit: {
            max: 2,
            timeWindow: 1000,
            skipOnError: true
          }
        }
      },
      async (req, reply) => 'hello!'
    )

    let res

    res = await fastify.inject('/')
    assert.deepStrictEqual(res.statusCode, 200)
    assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

    await redis.flushall()
    await redis.quit()

    res = await fastify.inject('/')
    assert.deepStrictEqual(res.statusCode, 200)
    assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '2')

    res = await fastify.inject('/')
    assert.deepStrictEqual(res.statusCode, 200)
    assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '2')
  })

  tap.test('When continue exceeding is on (Redis)', async (t) => {
    const fastify = Fastify()
    const redis = await new Redis({ host: REDIS_HOST })

    await fastify.register(rateLimit, {
      global: false,
      redis
    })

    fastify.get(
      '/',
      {
        config: {
          rateLimit: {
            timeWindow: 5000,
            max: 1,
            continueExceeding: true
          }
        }
      },
      async (req, reply) => 'hello!'
    )

    const first = await fastify.inject({
      url: '/',
      method: 'GET'
    })
    const second = await fastify.inject({
      url: '/',
      method: 'GET'
    })

    assert.deepStrictEqual(first.statusCode, 200)

    assert.deepStrictEqual(second.statusCode, 429)
    assert.deepStrictEqual(second.headers['x-ratelimit-limit'], '1')
    assert.deepStrictEqual(second.headers['x-ratelimit-remaining'], '0')
    assert.deepStrictEqual(second.headers['x-ratelimit-reset'], '5')

    await redis.flushall()
    await redis.quit()
  })

  tap.test('When continue exceeding is off under route (Redis)', async (t) => {
    const fastify = Fastify()
    const redis = await new Redis({ host: REDIS_HOST })

    await fastify.register(rateLimit, {
      global: false,
      continueExceeding: true,
      redis
    })

    fastify.get(
      '/',
      {
        config: {
          rateLimit: {
            timeWindow: 5000,
            max: 1,
            continueExceeding: false
          }
        }
      },
      async (req, reply) => 'hello!'
    )

    const first = await fastify.inject({
      url: '/',
      method: 'GET'
    })
    const second = await fastify.inject({
      url: '/',
      method: 'GET'
    })

    await sleep(2000)

    const third = await fastify.inject({
      url: '/',
      method: 'GET'
    })

    assert.deepStrictEqual(first.statusCode, 200)

    assert.deepStrictEqual(second.statusCode, 429)
    assert.deepStrictEqual(second.headers['x-ratelimit-limit'], '1')
    assert.deepStrictEqual(second.headers['x-ratelimit-remaining'], '0')
    assert.deepStrictEqual(second.headers['x-ratelimit-reset'], '5')

    assert.deepStrictEqual(third.statusCode, 429)
    assert.deepStrictEqual(third.headers['x-ratelimit-limit'], '1')
    assert.deepStrictEqual(third.headers['x-ratelimit-remaining'], '0')
    assert.deepStrictEqual(third.headers['x-ratelimit-reset'], '3')

    await redis.flushall()
    await redis.quit()
  })
})
