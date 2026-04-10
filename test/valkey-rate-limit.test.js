'use strict'

const { test, mock } = require('node:test')
const Fastify = require('fastify')
const rateLimit = require('../index')
const ValkeyStore = require('../store/ValkeyStore')

test('With valkey store option', async (t) => {
  t.plan(15)

  const clock = mock.timers
  clock.enable(0)

  class FakeScript {
    constructor (source) {
      this.source = source
    }
  }

  const counters = new Map()

  const valkey = {
    invokeScript: async (_script, options) => {
      const key = options.keys[0]
      const timeWindow = Number(options.args[0])
      const current = (counters.get(key) || 0) + 1

      counters.set(key, current)

      return [current, timeWindow]
    }
  }

  ValkeyStore.Script = FakeScript

  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: 1000,
    valkey
  })

  fastify.get('/', async () => 'hello!')

  let res

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 429)
  t.assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
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

  clock.tick(1100)
  counters.clear()

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  ValkeyStore.Script = null
  clock.reset()
})

test('valkey and redis cannot be configured together', async (t) => {
  t.plan(1)

  const fastify = Fastify()

  fastify.register(rateLimit, {
    valkey: { invokeScript: async () => ['1', '1000'] },
    redis: {}
  })

  await t.assert.rejects(
    fastify.ready(),
    new Error('redis and valkey cannot be used together')
  )
})

test('store cannot be configured together with valkey', async (t) => {
  t.plan(1)

  function CustomStore () {}

  const fastify = Fastify()

  fastify.register(rateLimit, {
    store: CustomStore,
    valkey: { invokeScript: async () => ['1', '1000'] }
  })

  await t.assert.rejects(
    fastify.ready(),
    new Error('store cannot be used together with redis or valkey')
  )
})

test('store cannot be configured together with redis', async (t) => {
  t.plan(1)

  function CustomStore () {}

  const fastify = Fastify()

  fastify.register(rateLimit, {
    store: CustomStore,
    redis: {}
  })

  await t.assert.rejects(
    fastify.ready(),
    new Error('store cannot be used together with redis or valkey')
  )
})

test('ValkeyStore reports a helpful error when valkey-glide is missing', (t) => {
  t.plan(2)

  const originalScript = ValkeyStore.Script

  ValkeyStore.Script = null

  try {
    require.cache[require.resolve('../store/ValkeyStore')].exports.Script = null
  } catch {}

  const Module = require('node:module')
  const originalLoad = Module._load

  Module._load = function (request, parent, isMain) {
    if (request === '@valkey/valkey-glide') {
      throw new Error('missing module')
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  delete require.cache[require.resolve('../store/ValkeyStore')]
  const ReloadedValkeyStore = require('../store/ValkeyStore')

  try {
    t.assert.throws(() => {
      return new ReloadedValkeyStore(false, false, {})
    }, /Valkey support requires @valkey\/valkey-glide to be installed/)
    t.assert.strictEqual(ReloadedValkeyStore.Script, null)
  } finally {
    Module._load = originalLoad
    delete require.cache[require.resolve('../store/ValkeyStore')]
    require('../store/ValkeyStore').Script = originalScript
  }
})

test('Skip on valkey error', async (t) => {
  t.plan(9)

  class FakeScript {
    constructor (source) {
      this.source = source
    }
  }

  let shouldFail = false

  ValkeyStore.Script = FakeScript

  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: 1000,
    valkey: {
      invokeScript: async () => {
        if (shouldFail) {
          throw new Error('boom')
        }

        return ['1', '1000']
      }
    },
    skipOnError: true
  })

  fastify.get('/', async () => 'hello!')

  let res

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  shouldFail = true

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '2')

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '2')

  ValkeyStore.Script = null
})

test('Throw on valkey error', async (t) => {
  t.plan(5)

  class FakeScript {
    constructor (source) {
      this.source = source
    }
  }

  let shouldFail = false

  ValkeyStore.Script = FakeScript

  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: 1000,
    valkey: {
      invokeScript: async () => {
        if (shouldFail) {
          throw new Error('boom')
        }

        return ['1', '1000']
      }
    },
    skipOnError: false
  })

  fastify.get('/', async () => 'hello!')

  let res

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  shouldFail = true

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 500)
  t.assert.deepStrictEqual(
    res.body,
    '{"statusCode":500,"error":"Internal Server Error","message":"boom"}'
  )

  ValkeyStore.Script = null
})
