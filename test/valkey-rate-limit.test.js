'use strict'

const { test, describe } = require('node:test')
const Fastify = require('fastify')
const rateLimit = require('../index')

function createMockValkey () {
  const store = {}
  return {
    customCommand (args) {
      const [cmd, script, numKeys, key, timeWindow, max, continueExceeding, exponentialBackoff] = args

      if (cmd !== 'EVAL') {
        return Promise.reject(new Error(`Unexpected command: ${cmd}`))
      }

      const tw = Number(timeWindow)
      const m = Number(max)
      const contExc = continueExceeding === 'true'
      const expBack = exponentialBackoff === 'true'

      if (!store[key]) {
        store[key] = { current: 0, ttl: tw }
      }
      store[key].current++
      const current = store[key].current

      if (current === 1 || (contExc && current > m)) {
        store[key].ttl = tw
      } else if (expBack && current > m) {
        const backoffExponent = current - m - 1
        store[key].ttl = Math.min(tw * (2 ** backoffExponent), Number.MAX_SAFE_INTEGER)
      }

      return Promise.resolve([current, store[key].ttl])
    }
  }
}

function createFailingValkey () {
  return {
    customCommand () {
      return Promise.reject(new Error('Valkey connection error'))
    }
  }
}

describe('Valkey rate limit', () => {
  test('With valkey store', async (t) => {
    t.plan(21)
    const fastify = Fastify()
    const valkey = createMockValkey()
    await fastify.register(rateLimit, {
      max: 2,
      timeWindow: 1000,
      valkey
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

    res = await fastify.inject('/')
    t.assert.deepStrictEqual(res.statusCode, 429)
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

    await fastify.close()
  })

  test('With valkey store - skipOnError', async (t) => {
    t.plan(2)
    const fastify = Fastify()
    const valkey = createFailingValkey()
    await fastify.register(rateLimit, {
      max: 2,
      timeWindow: 1000,
      valkey,
      skipOnError: true
    })

    fastify.get('/', async () => 'hello!')

    const res = await fastify.inject('/')
    t.assert.strictEqual(res.statusCode, 200)
    t.assert.strictEqual(res.payload, 'hello!')

    await fastify.close()
  })

  test('With valkey store - route rate limit', async (t) => {
    t.plan(4)
    const fastify = Fastify()
    const valkey = createMockValkey()
    await fastify.register(rateLimit, {
      global: false,
      valkey
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
    t.assert.strictEqual(res.statusCode, 200)
    t.assert.strictEqual(res.payload, 'hello!')

    res = await fastify.inject('/')
    t.assert.strictEqual(res.statusCode, 429)
    t.assert.ok(res.headers['retry-after'])

    await fastify.close()
  })

  test('With valkey store - nameSpace', async (t) => {
    t.plan(2)
    const fastify = Fastify()
    const valkey = createMockValkey()
    await fastify.register(rateLimit, {
      max: 1,
      timeWindow: 1000,
      valkey,
      nameSpace: 'my-app-'
    })

    fastify.get('/', async () => 'hello!')

    const res = await fastify.inject('/')
    t.assert.strictEqual(res.statusCode, 200)
    t.assert.strictEqual(res.payload, 'hello!')

    await fastify.close()
  })
})
