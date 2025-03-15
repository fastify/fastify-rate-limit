'use strict'

const { test, describe } = require('node:test')
const Redis = require('ioredis')
const Fastify = require('fastify')
const rateLimit = require('../index')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const REDIS_HOST = '127.0.0.1'

describe('Global rate limit', () => {
  test('With redis store', async (t) => {
    t.plan(21)
    const fastify = Fastify()
    const redis = await new Redis({ host: REDIS_HOST })
    await fastify.register(rateLimit, {
      max: 2,
      timeWindow: 1000,
      redis
    })

    fastify.get('/', async () => 'hello!')

    let res

    res = await fastify.inject('/')
    t.assert.strictEqual(res.statusCode, 200)
    t.assert.ok(res)
    t.assert.strictEqual(res.statusCode, 200)
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

    res = await fastify.inject('/')
    t.assert.deepStrictEqual(res.statusCode, 200)
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

    await sleep(100)

    res = await fastify.inject('/')
    t.assert.deepStrictEqual(res.statusCode, 429)
    t.assert.deepStrictEqual(
      res.headers['content-type'],
      'application/json; charset=utf-8'
    )
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')
    t.assert.deepStrictEqual(res.headers['retry-after'], '1')
    t.assert.deepStrictEqual(
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

    t.assert.deepStrictEqual(res.statusCode, 200)
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

    await redis.flushall()
    await redis.quit()
  })

  test('With redis store (ban)', async (t) => {
    t.plan(19)
    const fastify = Fastify()
    const redis = await new Redis({ host: REDIS_HOST })
    await fastify.register(rateLimit, {
      max: 1,
      ban: 1,
      timeWindow: 1000,
      redis
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
    t.assert.deepStrictEqual(
      res.headers['content-type'],
      'application/json; charset=utf-8'
    )
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')
    t.assert.deepStrictEqual(res.headers['retry-after'], '1')
    t.assert.deepStrictEqual(
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

    t.assert.deepStrictEqual(res.statusCode, 200)
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

    await redis.flushall()
    await redis.quit()
  })

  test('Skip on redis error', async (t) => {
    t.plan(9)
    const fastify = Fastify()
    const redis = await new Redis({ host: REDIS_HOST })
    await fastify.register(rateLimit, {
      max: 2,
      timeWindow: 1000,
      redis,
      skipOnError: true
    })

    fastify.get('/', async () => 'hello!')

    let res

    res = await fastify.inject('/')
    t.assert.deepStrictEqual(res.statusCode, 200)
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

    await redis.flushall()
    await redis.quit()

    res = await fastify.inject('/')
    t.assert.deepStrictEqual(res.statusCode, 200)
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '2')

    res = await fastify.inject('/')
    t.assert.deepStrictEqual(res.statusCode, 200)
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '2')
  })

  test('Throw on redis error', async (t) => {
    t.plan(5)
    const fastify = Fastify()
    const redis = await new Redis({ host: REDIS_HOST })
    await fastify.register(rateLimit, {
      max: 2,
      timeWindow: 1000,
      redis,
      skipOnError: false
    })

    fastify.get('/', async () => 'hello!')

    let res

    res = await fastify.inject('/')
    t.assert.deepStrictEqual(res.statusCode, 200)
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

    await redis.flushall()
    await redis.quit()

    res = await fastify.inject('/')
    t.assert.deepStrictEqual(res.statusCode, 500)
    t.assert.deepStrictEqual(
      res.body,
      '{"statusCode":500,"error":"Internal Server Error","message":"Connection is closed."}'
    )
  })

  test('When continue exceeding is on (Redis)', async (t) => {
    const fastify = Fastify()
    const redis = await new Redis({ host: REDIS_HOST })

    await fastify.register(rateLimit, {
      redis,
      max: 1,
      timeWindow: 5000,
      continueExceeding: true
    })

    fastify.get('/', async () => 'hello!')

    const first = await fastify.inject({
      url: '/',
      method: 'GET'
    })
    const second = await fastify.inject({
      url: '/',
      method: 'GET'
    })

    t.assert.deepStrictEqual(first.statusCode, 200)

    t.assert.deepStrictEqual(second.statusCode, 429)
    t.assert.deepStrictEqual(second.headers['x-ratelimit-limit'], '1')
    t.assert.deepStrictEqual(second.headers['x-ratelimit-remaining'], '0')
    t.assert.deepStrictEqual(second.headers['x-ratelimit-reset'], '5')

    await redis.flushall()
    await redis.quit()
  })

  test('Redis with continueExceeding should not always return the timeWindow as ttl', async (t) => {
    t.plan(19)
    const fastify = Fastify()
    const redis = await new Redis({ host: REDIS_HOST })
    await fastify.register(rateLimit, {
      max: 2,
      timeWindow: 3000,
      continueExceeding: true,
      redis
    })

    fastify.get('/', async () => 'hello!')

    let res

    res = await fastify.inject('/')
    t.assert.deepStrictEqual(res.statusCode, 200)
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '3')

    // After this sleep, we should not see `x-ratelimit-reset === 3` anymore
    await sleep(1000)

    res = await fastify.inject('/')
    t.assert.deepStrictEqual(res.statusCode, 200)
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '2')

    res = await fastify.inject('/')
    t.assert.deepStrictEqual(res.statusCode, 429)
    t.assert.deepStrictEqual(
      res.headers['content-type'],
      'application/json; charset=utf-8'
    )
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '3')
    t.assert.deepStrictEqual(res.headers['retry-after'], '3')
    t.assert.deepStrictEqual(
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

    t.assert.deepStrictEqual(res.statusCode, 429)
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '3')

    await redis.flushall()
    await redis.quit()
  })

  test('When use a custom nameSpace', async (t) => {
    const fastify = Fastify()
    const redis = await new Redis({ host: REDIS_HOST })

    await fastify.register(rateLimit, {
      max: 2,
      timeWindow: 1000,
      redis,
      nameSpace: 'my-namespace:',
      keyGenerator: (req) => req.headers['x-my-header']
    })

    fastify.get('/', async () => 'hello!')

    const allowListHeader = {
      method: 'GET',
      url: '/',
      headers: {
        'x-my-header': 'custom name space'
      }
    }

    let res

    res = await fastify.inject(allowListHeader)
    t.assert.deepStrictEqual(res.statusCode, 200)
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

    res = await fastify.inject(allowListHeader)
    t.assert.deepStrictEqual(res.statusCode, 200)
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

    res = await fastify.inject(allowListHeader)
    t.assert.deepStrictEqual(res.statusCode, 429)
    t.assert.deepStrictEqual(
      res.headers['content-type'],
      'application/json; charset=utf-8'
    )
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')
    t.assert.deepStrictEqual(res.headers['retry-after'], '1')
    t.assert.deepStrictEqual(
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

    t.assert.deepStrictEqual(res.statusCode, 200)
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

    await redis.flushall()
    await redis.quit()
  })

  test('With redis store and exponential backoff', async (t) => {
    t.plan(20)
    const fastify = Fastify()
    const redis = await new Redis({ host: REDIS_HOST })
    await fastify.register(rateLimit, {
      max: 2,
      timeWindow: 1000,
      redis,
      exponentialBackoff: true
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

    // First attempt over the limit should have the normal timeWindow (1000ms)
    res = await fastify.inject('/')
    t.assert.deepStrictEqual(res.statusCode, 429)
    t.assert.deepStrictEqual(
      res.headers['content-type'],
      'application/json; charset=utf-8'
    )
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')
    t.assert.deepStrictEqual(res.headers['retry-after'], '1')
    t.assert.deepStrictEqual(
      {
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded, retry in 1 second'
      },
      JSON.parse(res.payload)
    )

    // Second attempt over the limit should have doubled timeWindow (2000ms)
    res = await fastify.inject('/')
    t.assert.deepStrictEqual(res.statusCode, 429)
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
    t.assert.deepStrictEqual(res.headers['retry-after'], '2')
    t.assert.deepStrictEqual(
      {
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded, retry in 2 seconds'
      },
      JSON.parse(res.payload)
    )

    await redis.flushall()
    await redis.quit()
  })
})

describe('Route rate limit', () => {
  test('With redis store', async t => {
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
    }, async () => 'hello!')

    let res

    res = await fastify.inject('/')
    t.assert.strictEqual(res.statusCode, 200)
    t.assert.strictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.strictEqual(res.headers['x-ratelimit-remaining'], '1')
    t.assert.strictEqual(res.headers['x-ratelimit-reset'], '1')

    res = await fastify.inject('/')
    t.assert.strictEqual(res.statusCode, 200)
    t.assert.strictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.strictEqual(res.headers['x-ratelimit-remaining'], '0')
    t.assert.strictEqual(res.headers['x-ratelimit-reset'], '1')

    res = await fastify.inject('/')
    t.assert.strictEqual(res.statusCode, 429)
    t.assert.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8')
    t.assert.strictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.strictEqual(res.headers['x-ratelimit-remaining'], '0')
    t.assert.strictEqual(res.headers['x-ratelimit-reset'], '1')
    t.assert.strictEqual(res.headers['retry-after'], '1')
    t.assert.deepStrictEqual({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry in 1 second'
    }, JSON.parse(res.payload))

    // Not using fake timers here as we use an external Redis that would not be effected by this
    await sleep(1100)

    res = await fastify.inject('/')
    t.assert.strictEqual(res.statusCode, 200)
    t.assert.strictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.strictEqual(res.headers['x-ratelimit-remaining'], '1')
    t.assert.strictEqual(res.headers['x-ratelimit-reset'], '1')

    await redis.flushall()
    await redis.quit()
  })

  test('Throw on redis error', async (t) => {
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
      async () => 'hello!'
    )

    let res

    res = await fastify.inject('/')
    t.assert.deepStrictEqual(res.statusCode, 200)
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

    await redis.flushall()
    await redis.quit()

    res = await fastify.inject('/')
    t.assert.deepStrictEqual(res.statusCode, 500)
    t.assert.deepStrictEqual(
      res.body,
      '{"statusCode":500,"error":"Internal Server Error","message":"Connection is closed."}'
    )
  })

  test('Skip on redis error', async (t) => {
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
      async () => 'hello!'
    )

    let res

    res = await fastify.inject('/')
    t.assert.deepStrictEqual(res.statusCode, 200)
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

    await redis.flushall()
    await redis.quit()

    res = await fastify.inject('/')
    t.assert.deepStrictEqual(res.statusCode, 200)
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '2')

    res = await fastify.inject('/')
    t.assert.deepStrictEqual(res.statusCode, 200)
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '2')
  })

  test('When continue exceeding is on (Redis)', async (t) => {
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
      async () => 'hello!'
    )

    const first = await fastify.inject({
      url: '/',
      method: 'GET'
    })
    const second = await fastify.inject({
      url: '/',
      method: 'GET'
    })

    t.assert.deepStrictEqual(first.statusCode, 200)

    t.assert.deepStrictEqual(second.statusCode, 429)
    t.assert.deepStrictEqual(second.headers['x-ratelimit-limit'], '1')
    t.assert.deepStrictEqual(second.headers['x-ratelimit-remaining'], '0')
    t.assert.deepStrictEqual(second.headers['x-ratelimit-reset'], '5')

    await redis.flushall()
    await redis.quit()
  })

  test('When continue exceeding is off under route (Redis)', async (t) => {
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
      async () => 'hello!'
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

    t.assert.deepStrictEqual(first.statusCode, 200)

    t.assert.deepStrictEqual(second.statusCode, 429)
    t.assert.deepStrictEqual(second.headers['x-ratelimit-limit'], '1')
    t.assert.deepStrictEqual(second.headers['x-ratelimit-remaining'], '0')
    t.assert.deepStrictEqual(second.headers['x-ratelimit-reset'], '5')

    t.assert.deepStrictEqual(third.statusCode, 429)
    t.assert.deepStrictEqual(third.headers['x-ratelimit-limit'], '1')
    t.assert.deepStrictEqual(third.headers['x-ratelimit-remaining'], '0')
    t.assert.deepStrictEqual(third.headers['x-ratelimit-reset'], '3')

    await redis.flushall()
    await redis.quit()
  })

  test('Route-specific exponential backoff with redis store', async (t) => {
    t.plan(17)
    const fastify = Fastify()
    const redis = await new Redis({ host: REDIS_HOST })
    await fastify.register(rateLimit, {
      global: false,
      redis
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

    // First attempt over the limit should have the normal timeWindow (1000ms)
    res = await fastify.inject('/')
    t.assert.deepStrictEqual(res.statusCode, 429)
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
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

    // Second attempt over the limit should have doubled timeWindow (2000ms)
    res = await fastify.inject('/')
    t.assert.deepStrictEqual(res.statusCode, 429)
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
    t.assert.deepStrictEqual(res.headers['retry-after'], '2')
    t.assert.deepStrictEqual(
      {
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded, retry in 2 seconds'
      },
      JSON.parse(res.payload)
    )

    // Third attempt over the limit should have quadrupled timeWindow (4000ms)
    res = await fastify.inject('/')
    t.assert.deepStrictEqual(res.statusCode, 429)
    t.assert.deepStrictEqual(res.headers['retry-after'], '4')
    t.assert.deepStrictEqual(
      {
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded, retry in 4 seconds'
      },
      JSON.parse(res.payload)
    )

    await redis.flushall()
    await redis.quit()
  })
})
