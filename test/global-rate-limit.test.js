'use strict'

const { mock } = require('node:test')
const tap = require('tap')
const assert = require('node:assert')
const Fastify = require('fastify')
const rateLimit = require('../index')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

tap.test('Basic', async (t) => {
  t.plan(15)
  const clock = mock.timers
  clock.enable(0)
  const fastify = Fastify()
  await fastify.register(rateLimit, { max: 2, timeWindow: 1000 })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  assert.deepStrictEqual(res.headers['retry-after'], '1')
  assert.deepStrictEqual(
    {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry in 1 second'
    },
    JSON.parse(res.payload)
  )

  clock.tick(1100)

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
  clock.reset()
})

tap.test('With text timeWindow', async (t) => {
  t.plan(15)
  const clock = mock.timers
  clock.enable(0)
  const fastify = Fastify()
  await fastify.register(rateLimit, { max: 2, timeWindow: '1s' })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  assert.deepStrictEqual(res.headers['retry-after'], '1')
  assert.deepStrictEqual(
    {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry in 1 second'
    },
    JSON.parse(res.payload)
  )

  clock.tick(1100)

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
  clock.reset()
})

tap.test('With function timeWindow', async (t) => {
  t.plan(15)
  const clock = mock.timers
  clock.enable(0)
  const fastify = Fastify()
  await fastify.register(rateLimit, { max: 2, timeWindow: (_, __) => 1000 })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  assert.deepStrictEqual(res.headers['retry-after'], '1')
  assert.deepStrictEqual(
    {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry in 1 second'
    },
    JSON.parse(res.payload)
  )

  clock.tick(1100)

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
  clock.reset()
})

tap.test('When passing NaN to the timeWindow property then the timeWindow should be the default value - 60 seconds', async (t) => {
  t.plan(5)
  const clock = mock.timers
  clock.enable(0)
  const defaultTimeWindowInSeconds = '60'

  const fastify = Fastify()
  await fastify.register(rateLimit, { max: 1, timeWindow: NaN })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(
    res.headers['x-ratelimit-reset'],
    defaultTimeWindowInSeconds
  )

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 429)

  // Wait for almost 60s to make sure the time limit is right
  clock.tick(55 * 1000)

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 429)

  // Wait for the seconds that left until the time limit reset
  clock.tick(5 * 1000)

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  clock.reset()
})

tap.test('With ips allowList, allowed ips should not result in rate limiting', async (t) => {
  t.plan(3)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: '2s',
    allowList: ['127.0.0.1']
  })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)
})

tap.test('With ips allowList, not allowed ips should result in rate limiting', async (t) => {
  t.plan(3)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: '2s',
    allowList: ['1.1.1.1']
  })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 429)
})

tap.test('With ips whitelist', async (t) => {
  t.plan(3)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: '2s',
    whitelist: ['127.0.0.1']
  })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)
})

tap.test('With function allowList', async (t) => {
  t.plan(18)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: '2s',
    keyGenerator () {
      return 42
    },
    allowList: function (req, key) {
      assert.ok(req.headers)
      assert.deepStrictEqual(key, 42)
      return req.headers['x-my-header'] !== undefined
    }
  })

  fastify.get('/', async (req, reply) => 'hello!')

  const allowListHeader = {
    method: 'GET',
    url: '/',
    headers: {
      'x-my-header': 'FOO BAR'
    }
  }

  let res

  res = await fastify.inject(allowListHeader)
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject(allowListHeader)
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject(allowListHeader)
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 429)
})

tap.test('With async/await function allowList', async (t) => {
  t.plan(18)
  const fastify = Fastify()

  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: '2s',
    keyGenerator () {
      return 42
    },
    allowList: async function (req, key) {
      await sleep(1)
      assert.ok(req.headers)
      assert.deepStrictEqual(key, 42)
      return req.headers['x-my-header'] !== undefined
    }
  })

  fastify.get('/', async (req, reply) => 'hello!')

  const allowListHeader = {
    method: 'GET',
    url: '/',
    headers: {
      'x-my-header': 'FOO BAR'
    }
  }

  let res

  res = await fastify.inject(allowListHeader)
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject(allowListHeader)
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject(allowListHeader)
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 429)
})

tap.test('With onExceeding option', async (t) => {
  t.plan(5)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: '2s',
    onExceeding: function (req, key) {
      if (req && key) assert.ok('onExceeding called')
    }
  })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 429)
})

tap.test('With onExceeded option', async (t) => {
  t.plan(4)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: '2s',
    onExceeded: function (req, key) {
      if (req && key) assert.ok('onExceeded called')
    }
  })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 429)
})

tap.test('With onBanReach option', async (t) => {
  t.plan(4)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 1,
    ban: 1,
    onBanReach: function (req) {
      // onBanReach called
      assert.ok(req)
    }
  })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 429)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 403)
})

tap.test('With keyGenerator', async (t) => {
  t.plan(19)
  const clock = mock.timers
  clock.enable(0)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: 1000,
    keyGenerator (req) {
      assert.deepStrictEqual(req.headers['my-custom-header'], 'random-value')
      return req.headers['my-custom-header']
    }
  })

  fastify.get('/', async (req, reply) => 'hello!')

  const payload = {
    method: 'GET',
    url: '/',
    headers: {
      'my-custom-header': 'random-value'
    }
  }

  let res

  res = await fastify.inject(payload)
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  res = await fastify.inject(payload)
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject(payload)
  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  assert.deepStrictEqual(res.headers['retry-after'], '1')
  assert.deepStrictEqual(
    {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry in 1 second'
    },
    JSON.parse(res.payload)
  )

  clock.tick(1100)

  res = await fastify.inject(payload)
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
  clock.reset()
})

tap.test('With async/await keyGenerator', async (t) => {
  t.plan(16)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 1,
    timeWindow: 1000,
    keyGenerator: async function (req) {
      await sleep(1)
      assert.deepStrictEqual(req.headers['my-custom-header'], 'random-value')
      return req.headers['my-custom-header']
    }
  })

  fastify.get('/', async (req, reply) => 'hello!')

  const payload = {
    method: 'GET',
    url: '/',
    headers: {
      'my-custom-header': 'random-value'
    }
  }

  let res

  res = await fastify.inject(payload)
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject(payload)
  assert.deepStrictEqual(res.statusCode, 429)
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
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry in 1 second'
    },
    JSON.parse(res.payload)
  )

  await sleep(1100)

  res = await fastify.inject(payload)
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
})

tap.test('With CustomStore', async (t) => {
  t.plan(15)

  function CustomStore (options) {
    this.options = options
    this.current = 0
  }

  CustomStore.prototype.incr = function (key, cb) {
    const timeWindow = this.options.timeWindow
    this.current++
    cb(null, { current: this.current, ttl: timeWindow - this.current * 1000 })
  }

  CustomStore.prototype.child = function (routeOptions) {
    const store = new CustomStore(
      Object.assign(this.options, routeOptions.config.rateLimit)
    )
    return store
  }

  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: 10000,
    store: CustomStore
  })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
  assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '9')

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '8')

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '7')
  assert.deepStrictEqual(res.headers['retry-after'], '7')
  assert.deepStrictEqual(
    {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry in 10 seconds'
    },
    JSON.parse(res.payload)
  )
})

tap.test('does not override the onRequest', async (t) => {
  t.plan(4)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: 1000
  })

  fastify.get(
    '/',
    {
      onRequest: function (req, reply, next) {
        assert.ok('onRequest called')
        next()
      }
    },
    async (req, reply) => 'hello!'
  )

  const res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
})

tap.test('does not override the onRequest as an array', async (t) => {
  t.plan(4)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: 1000
  })

  fastify.get(
    '/',
    {
      onRequest: [
        function (req, reply, next) {
          assert.ok('onRequest called')
          next()
        }
      ]
    },
    async (req, reply) => 'hello!'
  )

  const res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
})

tap.test('variable max', async (t) => {
  t.plan(4)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: (req, key) => {
      assert.ok(req)
      return +req.headers['secret-max']
    },
    timeWindow: 1000
  })

  fastify.get('/', async (req, res) => 'hello')

  const res = await fastify.inject({ url: '/', headers: { 'secret-max': 50 } })

  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '50')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '49')
})

tap.test('variable max contenders', async (t) => {
  t.plan(7)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    keyGenerator: (req) => req.headers['api-key'],
    max: (req, key) => (key === 'pro' ? 3 : 2),
    timeWindow: 10000
  })

  fastify.get('/', async (req, res) => 'hello')

  const requestSequence = [
    { headers: { 'api-key': 'pro' }, status: 200, url: '/' },
    { headers: { 'api-key': 'pro' }, status: 200, url: '/' },
    { headers: { 'api-key': 'pro' }, status: 200, url: '/' },
    { headers: { 'api-key': 'pro' }, status: 429, url: '/' },
    { headers: { 'api-key': 'NOT' }, status: 200, url: '/' },
    { headers: { 'api-key': 'NOT' }, status: 200, url: '/' },
    { headers: { 'api-key': 'NOT' }, status: 429, url: '/' }
  ]

  for (const item of requestSequence) {
    const res = await fastify.inject({ url: item.url, headers: item.headers })
    assert.deepStrictEqual(res.statusCode, item.status)
  }
})

tap.test('when passing NaN to max variable then it should use the default max - 1000', async (t) => {
  t.plan(2002)

  const defaultMax = 1000

  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: NaN,
    timeWindow: 10000
  })

  fastify.get('/', async (req, res) => 'hello')

  for (let i = 0; i < defaultMax; i++) {
    const res = await fastify.inject('/')
    assert.deepStrictEqual(res.statusCode, 200)
    assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1000')
  }

  const res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1000')
})

tap.test('hide rate limit headers', async (t) => {
  t.plan(14)
  const clock = mock.timers
  clock.enable(0)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 1,
    timeWindow: 1000,
    addHeaders: {
      'x-ratelimit-limit': false,
      'x-ratelimit-remaining': false,
      'x-ratelimit-reset': false,
      'retry-after': false
    }
  })

  fastify.get('/', async (req, res) => 'hello')

  let res

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  assert.notStrictEqual(
    res.headers['x-ratelimit-limit'],
    'the header must be missing'
  )
  assert.notStrictEqual(
    res.headers['x-ratelimit-remaining'],
    'the header must be missing'
  )
  assert.notStrictEqual(
    res.headers['x-ratelimit-reset'],
    'the header must be missing'
  )
  assert.notStrictEqual(
    res.headers['retry-after'],
    'the header must be missing'
  )

  clock.tick(1100)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

  clock.reset()
})

tap.test('hide rate limit headers on exceeding', async (t) => {
  t.plan(14)
  const clock = mock.timers
  clock.enable(0)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 1,
    timeWindow: 1000,
    addHeadersOnExceeding: {
      'x-ratelimit-limit': false,
      'x-ratelimit-remaining': false,
      'x-ratelimit-reset': false
    }
  })

  fastify.get('/', async (req, res) => 'hello')

  let res

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.notStrictEqual(
    res.headers['x-ratelimit-limit'],
    'the header must be missing'
  )
  assert.notStrictEqual(
    res.headers['x-ratelimit-remaining'],
    'the header must be missing'
  )
  assert.notStrictEqual(
    res.headers['x-ratelimit-reset'],
    'the header must be missing'
  )

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  assert.notStrictEqual(res.headers['x-ratelimit-reset'], undefined)
  assert.deepStrictEqual(res.headers['retry-after'], '1')

  clock.tick(1100)

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.notStrictEqual(
    res.headers['x-ratelimit-limit'],
    'the header must be missing'
  )
  assert.notStrictEqual(
    res.headers['x-ratelimit-remaining'],
    'the header must be missing'
  )
  assert.notStrictEqual(
    res.headers['x-ratelimit-reset'],
    'the header must be missing'
  )
  clock.reset()
})

tap.test('hide rate limit headers at all times', async (t) => {
  t.plan(14)
  const clock = mock.timers
  clock.enable(0)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 1,
    timeWindow: 1000,
    addHeaders: {
      'x-ratelimit-limit': false,
      'x-ratelimit-remaining': false,
      'x-ratelimit-reset': false,
      'retry-after': false
    },
    addHeadersOnExceeding: {
      'x-ratelimit-limit': false,
      'x-ratelimit-remaining': false,
      'x-ratelimit-reset': false
    }
  })

  fastify.get('/', async (req, res) => 'hello')

  let res

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.notStrictEqual(
    res.headers['x-ratelimit-limit'],
    'the header must be missing'
  )
  assert.notStrictEqual(
    res.headers['x-ratelimit-remaining'],
    'the header must be missing'
  )
  assert.notStrictEqual(
    res.headers['x-ratelimit-reset'],
    'the header must be missing'
  )

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  assert.notStrictEqual(
    res.headers['x-ratelimit-limit'],
    'the header must be missing'
  )
  assert.notStrictEqual(
    res.headers['x-ratelimit-remaining'],
    'the header must be missing'
  )
  assert.notStrictEqual(
    res.headers['x-ratelimit-reset'],
    'the header must be missing'
  )
  assert.notStrictEqual(
    res.headers['retry-after'],
    'the header must be missing'
  )

  clock.tick(1100)

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.notStrictEqual(
    res.headers['x-ratelimit-limit'],
    'the header must be missing'
  )
  assert.notStrictEqual(
    res.headers['x-ratelimit-remaining'],
    'the header must be missing'
  )
  assert.notStrictEqual(
    res.headers['x-ratelimit-reset'],
    'the header must be missing'
  )
  clock.reset()
})

tap.test('With ban', async (t) => {
  t.plan(3)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 1,
    ban: 1
  })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 429)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 403)
})

tap.test('stops fastify lifecycle after onRequest and before preValidation', async (t) => {
  t.plan(4)
  const fastify = Fastify()
  await fastify.register(rateLimit, { max: 1, timeWindow: 1000 })

  let preValidationCallCount = 0

  fastify.get(
    '/',
    {
      preValidation: function (req, reply, next) {
        assert.ok('preValidation called only once')
        preValidationCallCount++
        next()
      }
    },
    async (req, reply) => 'hello!'
  )

  let res

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(preValidationCallCount, 1)
})

tap.test('With enabled IETF Draft Spec', async (t) => {
  t.plan(16)

  const clock = mock.timers
  clock.enable(0)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: '1s',
    enableDraftSpec: true,
    errorResponseBuilder: (req, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry in 1 second',
      ttl: context.ttl
    })
  })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['ratelimit-remaining'], '1')

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['ratelimit-remaining'], '0')

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  assert.deepStrictEqual(res.headers['ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['ratelimit-remaining'], '0')
  assert.deepStrictEqual(
    res.headers['ratelimit-reset'],
    res.headers['retry-after']
  )
  const { ttl, ...payload } = JSON.parse(res.payload)
  assert.deepStrictEqual(
    res.headers['retry-after'],
    '' + Math.floor(ttl / 1000)
  )
  assert.deepStrictEqual(
    {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry in 1 second'
    },
    payload
  )

  clock.tick(1100)

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['ratelimit-remaining'], '1')
  clock.reset()
})

tap.test('hide IETF draft spec headers', async (t) => {
  t.plan(14)

  const clock = mock.timers
  clock.enable(0)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 1,
    timeWindow: 1000,
    enableDraftSpec: true,
    addHeaders: {
      'ratelimit-limit': false,
      'ratelimit-remaining': false,
      'ratelimit-reset': false,
      'retry-after': false
    }
  })

  fastify.get('/', async (req, res) => 'hello')

  let res

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['ratelimit-limit'], '1')
  assert.deepStrictEqual(res.headers['ratelimit-remaining'], '0')
  assert.deepStrictEqual(res.headers['ratelimit-reset'], '1')

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  assert.notStrictEqual(
    res.headers['ratelimit-limit'],
    'the header must be missing'
  )
  assert.notStrictEqual(
    res.headers['ratelimit-remaining'],
    'the header must be missing'
  )
  assert.notStrictEqual(
    res.headers['ratelimit-reset'],
    'the header must be missing'
  )
  assert.notStrictEqual(
    res.headers['retry-after'],
    'the header must be missing'
  )

  clock.tick(1100)

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['ratelimit-limit'], '1')
  assert.deepStrictEqual(res.headers['ratelimit-remaining'], '0')
  assert.deepStrictEqual(res.headers['ratelimit-reset'], '1')

  clock.reset()
})

tap.test('afterReset and Rate Limit remain the same when enableDraftSpec is enabled', async (t) => {
  t.plan(13)
  const clock = mock.timers
  clock.enable(0)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 1,
    timeWindow: '10s',
    enableDraftSpec: true
  })

  fastify.get('/', async (req, reply) => 'hello!')

  const res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['ratelimit-limit'], '1')
  assert.deepStrictEqual(res.headers['ratelimit-remaining'], '0')

  clock.tick(500)
  await retry('10')

  clock.tick(1000)
  await retry('9')

  async function retry (timeLeft) {
    const res = await fastify.inject('/')

    assert.deepStrictEqual(res.statusCode, 429)
    assert.deepStrictEqual(res.headers['ratelimit-limit'], '1')
    assert.deepStrictEqual(res.headers['ratelimit-remaining'], '0')
    assert.deepStrictEqual(res.headers['ratelimit-reset'], timeLeft)
    assert.deepStrictEqual(
      res.headers['ratelimit-reset'],
      res.headers['retry-after']
    )
  }
  clock.reset()
})

tap.test('Before async in "max"', async (t) => {
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    keyGenerator: (req) => req.headers['api-key'],
    max: async (req, key) => requestSequence(key),
    timeWindow: 10000
  })

  await fastify.get('/', async (req, res) => 'hello')

  const requestSequence = async (key) => ((await key) === 'pro' ? 5 : 2)
})

tap.test('exposeHeadRoutes', async (t) => {
  const fastify = Fastify({
    exposeHeadRoutes: true
  })
  await fastify.register(rateLimit, {
    max: 10,
    timeWindow: 1000
  })
  fastify.get('/', async (req, reply) => 'hello!')

  const res = await fastify.inject({
    url: '/',
    method: 'GET'
  })

  const resHead = await fastify.inject({
    url: '/',
    method: 'HEAD'
  })

  assert.deepStrictEqual(res.statusCode, 200, 'GET: Response status code')
  assert.deepStrictEqual(
    res.headers['x-ratelimit-limit'],
    '10',
    'GET: x-ratelimit-limit header (global rate limit)'
  )
  assert.deepStrictEqual(
    res.headers['x-ratelimit-remaining'],
    '9',
    'GET: x-ratelimit-remaining header (global rate limit)'
  )

  assert.deepStrictEqual(
    resHead.statusCode,
    200,
    'HEAD: Response status code'
  )
  assert.deepStrictEqual(
    resHead.headers['x-ratelimit-limit'],
    '10',
    'HEAD: x-ratelimit-limit header (global rate limit)'
  )
  assert.deepStrictEqual(
    resHead.headers['x-ratelimit-remaining'],
    '8',
    'HEAD: x-ratelimit-remaining header (global rate limit)'
  )
})

tap.test('When continue exceeding is on (Local)', async (t) => {
  const fastify = Fastify()

  await fastify.register(rateLimit, {
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
})

tap.test('on preHandler hook', async (t) => {
  const fastify = Fastify()

  await fastify.register(rateLimit, {
    max: 1,
    timeWindow: 10000,
    hook: 'preHandler',
    keyGenerator (req) {
      return req.userId || req.ip
    }
  })

  fastify.decorateRequest('userId', '')
  fastify.addHook('preHandler', async (req) => {
    const { userId } = req.query
    if (userId) {
      req.userId = userId
    }
  })

  fastify.get('/', async (req, reply) => 'fastify is awesome !')

  const send = (userId) => {
    let query
    if (userId) {
      query = { userId }
    }
    return fastify.inject({
      url: '/',
      method: 'GET',
      query
    })
  }
  const first = await send()
  const second = await send()
  const third = await send('123')
  const fourth = await send('123')
  const fifth = await send('234')

  assert.deepStrictEqual(first.statusCode, 200)
  assert.deepStrictEqual(second.statusCode, 429)
  assert.deepStrictEqual(third.statusCode, 200)
  assert.deepStrictEqual(fourth.statusCode, 429)
  assert.deepStrictEqual(fifth.statusCode, 200)
})

tap.test('ban directly', async (t) => {
  t.plan(15)

  const clock = mock.timers
  clock.enable(0)

  const fastify = Fastify()
  await fastify.register(rateLimit, { max: 2, ban: 0, timeWindow: '1s' })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 403)
  assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  assert.deepStrictEqual(res.headers['retry-after'], '1')
  assert.deepStrictEqual(
    {
      statusCode: 403,
      error: 'Forbidden',
      message: 'Rate limit exceeded, retry in 1 second'
    },
    JSON.parse(res.payload)
  )

  clock.tick(1100)

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
  clock.reset()
})

tap.test('wrong timewindow', async (t) => {
  t.plan(15)

  const clock = mock.timers
  clock.enable(0)

  const fastify = Fastify()
  await fastify.register(rateLimit, { max: 2, ban: 0, timeWindow: '1s' })

  fastify.get(
    '/',
    {
      config: {
        rateLimit: {
          timeWindow: -5
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

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 403)
  assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  assert.deepStrictEqual(res.headers['retry-after'], '60')
  assert.deepStrictEqual(
    {
      statusCode: 403,
      error: 'Forbidden',
      message: 'Rate limit exceeded, retry in 1 minute'
    },
    JSON.parse(res.payload)
  )

  clock.tick(1100)

  res = await fastify.inject('/')

  assert.deepStrictEqual(res.statusCode, 403)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  clock.reset()
})
