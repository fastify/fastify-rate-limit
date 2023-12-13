'use strict'

const t = require('tap')
const test = t.test
const Redis = require('ioredis')
const Fastify = require('fastify')
const rateLimit = require('../index')
const FakeTimers = require('@sinonjs/fake-timers')
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const REDIS_HOST = '127.0.0.1'

test('Basic', async t => {
  t.plan(15)
  t.context.clock = FakeTimers.install()
  const fastify = Fastify()
  await fastify.register(rateLimit, { max: 2, timeWindow: 1000 })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')

  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '1')

  res = await fastify.inject('/')

  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject('/')

  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '0')
  t.equal(res.headers['retry-after'], '1')
  t.same({
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 1 second'
  }, JSON.parse(res.payload))

  t.context.clock.tick(1100)

  res = await fastify.inject('/')

  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '1')

  t.teardown(() => {
    t.context.clock.uninstall()
  })
})

test('With text timeWindow', async t => {
  t.plan(15)
  t.context.clock = FakeTimers.install()
  const fastify = Fastify()
  await fastify.register(rateLimit, { max: 2, timeWindow: '1s' })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')

  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '1')

  res = await fastify.inject('/')

  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject('/')

  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '0')
  t.equal(res.headers['retry-after'], '1')
  t.same({
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 1 second'
  }, JSON.parse(res.payload))

  t.context.clock.tick(1100)

  res = await fastify.inject('/')

  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '1')

  t.teardown(() => {
    t.context.clock.uninstall()
  })
})

test('When passing NaN to the timeWindow property then the timeWindow should be the default value - 60 seconds', async t => {
  t.plan(5)

  t.context.clock = FakeTimers.install()

  const defaultTimeWindowInSeconds = '60'

  const fastify = Fastify()
  await fastify.register(rateLimit, { max: 1, timeWindow: NaN })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')

  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-reset'], defaultTimeWindowInSeconds)

  res = await fastify.inject('/')

  t.equal(res.statusCode, 429)

  // Wait for almost 60s to make sure the time limit is right
  t.context.clock.tick(55 * 1000)

  res = await fastify.inject('/')

  t.equal(res.statusCode, 429)

  // Wait for the seconds that left until the time limit reset
  t.context.clock.tick(5 * 1000)

  res = await fastify.inject('/')

  t.equal(res.statusCode, 200)

  t.teardown(() => {
    t.context.clock.uninstall()
  })
})

test('With ips allowList, allowed ips should not result in rate limiting', async t => {
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
  t.equal(res.statusCode, 200)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
})

test('With ips allowList, not allowed ips should result in rate limiting', async t => {
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
  t.equal(res.statusCode, 200)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 429)
})

test('With ips whitelist', async t => {
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
  t.equal(res.statusCode, 200)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
})

test('With function allowList', async t => {
  t.plan(18)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: '2s',
    keyGenerator () { return 42 },
    allowList: function (req, key) {
      t.ok(req.headers)
      t.equal(key, 42)
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
  t.equal(res.statusCode, 200)

  res = await fastify.inject(allowListHeader)
  t.equal(res.statusCode, 200)

  res = await fastify.inject(allowListHeader)
  t.equal(res.statusCode, 200)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 429)
})

test('With async/await function allowList', async t => {
  t.plan(18)
  const fastify = Fastify()

  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: '2s',
    keyGenerator () { return 42 },
    allowList: async function (req, key) {
      await sleep(1)
      t.ok(req.headers)
      t.equal(key, 42)
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
  t.equal(res.statusCode, 200)

  res = await fastify.inject(allowListHeader)
  t.equal(res.statusCode, 200)

  res = await fastify.inject(allowListHeader)
  t.equal(res.statusCode, 200)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 429)
})

test('With onExceeding option', async t => {
  t.plan(5)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: '2s',
    onExceeding: function (req, key) {
      if (req && key) t.pass('onExceeding called')
    }
  })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 429)
})

test('With onExceeded option', async t => {
  t.plan(4)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: '2s',
    onExceeded: function (req, key) {
      if (req && key) t.pass('onExceeded called')
    }
  })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 429)
})

test('With onBanReach option', async t => {
  t.plan(4)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 1,
    ban: 1,
    onBanReach: function (req) {
      t.pass('onBanReach called')
    }
  })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 429)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 403)
})

test('With redis store', async t => {
  t.plan(19)
  const fastify = Fastify()
  const redis = new Redis({ host: REDIS_HOST })
  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: 1000,
    redis
  })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '1')
  t.equal(res.headers['x-ratelimit-reset'], '1')

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '0')
  t.equal(res.headers['x-ratelimit-reset'], '1')

  await sleep(100)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '0')
  t.equal(res.headers['x-ratelimit-reset'], '1')
  t.equal(res.headers['retry-after'], '1')
  t.same({
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 1 second'
  }, JSON.parse(res.payload))

  // Not using fake timers here as we use an external Redis that would not be effected by this
  await sleep(1100)

  res = await fastify.inject('/')

  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '1')
  t.equal(res.headers['x-ratelimit-reset'], '1')

  t.teardown(async () => {
    await redis.flushall()
    await redis.quit()
  })
})

test('With redis store (ban)', async t => {
  t.plan(19)
  const fastify = Fastify()
  const redis = new Redis({ host: REDIS_HOST })
  await fastify.register(rateLimit, {
    max: 1,
    ban: 1,
    timeWindow: 1000,
    redis
  })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '1')
  t.equal(res.headers['x-ratelimit-remaining'], '0')
  t.equal(res.headers['x-ratelimit-reset'], '1')

  res = await fastify.inject('/')
  t.equal(res.statusCode, 429)
  t.equal(res.headers['x-ratelimit-limit'], '1')
  t.equal(res.headers['x-ratelimit-remaining'], '0')
  t.equal(res.headers['x-ratelimit-reset'], '1')

  res = await fastify.inject('/')
  t.equal(res.statusCode, 403)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['x-ratelimit-limit'], '1')
  t.equal(res.headers['x-ratelimit-remaining'], '0')
  t.equal(res.headers['x-ratelimit-reset'], '1')
  t.equal(res.headers['retry-after'], '1')
  t.same({
    statusCode: 403,
    error: 'Forbidden',
    message: 'Rate limit exceeded, retry in 1 second'
  }, JSON.parse(res.payload))

  // Not using fake timers here as we use an external Redis that would not be effected by this
  await sleep(1100)

  res = await fastify.inject('/')

  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '1')
  t.equal(res.headers['x-ratelimit-remaining'], '0')
  t.equal(res.headers['x-ratelimit-reset'], '1')

  t.teardown(async () => {
    await redis.flushall()
    await redis.quit()
  })
})

test('Skip on redis error', async t => {
  t.plan(9)
  const fastify = Fastify()
  const redis = new Redis({ host: REDIS_HOST })
  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: 1000,
    redis,
    skipOnError: true
  })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '1')

  await redis.flushall()
  await redis.quit()

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '2')

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '2')
})

test('Throw on redis error', async t => {
  t.plan(5)
  const fastify = Fastify()
  const redis = new Redis({ host: REDIS_HOST })
  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: 1000,
    redis,
    skipOnError: false
  })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '1')

  await redis.flushall()
  await redis.quit()

  res = await fastify.inject('/')
  t.equal(res.statusCode, 500)
  t.equal(res.body, '{"statusCode":500,"error":"Internal Server Error","message":"Connection is closed."}')
})

test('With keyGenerator', async t => {
  t.plan(19)
  t.context.clock = FakeTimers.install()
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: 1000,
    keyGenerator (req) {
      t.equal(req.headers['my-custom-header'], 'random-value')
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
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '1')

  res = await fastify.inject(payload)
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject(payload)
  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '0')
  t.equal(res.headers['retry-after'], '1')
  t.same({
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 1 second'
  }, JSON.parse(res.payload))

  t.context.clock.tick(1100)

  res = await fastify.inject(payload)
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '1')

  t.teardown(() => {
    t.context.clock.uninstall()
  })
})

test('With async/await keyGenerator', async t => {
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 1,
    timeWindow: 1000,
    keyGenerator: async function (req) {
      await sleep(1)
      t.equal(req.headers['my-custom-header'], 'random-value')
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
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '1')
  t.equal(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject(payload)
  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['x-ratelimit-limit'], '1')
  t.equal(res.headers['x-ratelimit-remaining'], '0')
  t.equal(res.headers['x-ratelimit-reset'], '1')
  t.equal(res.headers['retry-after'], '1')
  t.same({
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 1 second'
  }, JSON.parse(res.payload))

  await sleep(1100)

  res = await fastify.inject(payload)
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '1')
  t.equal(res.headers['x-ratelimit-remaining'], '0')
})

test('With CustomStore', async t => {
  t.plan(15)

  function CustomStore (options) {
    this.options = options
    this.current = 0
  }

  CustomStore.prototype.incr = function (key, cb) {
    const timeWindow = this.options.timeWindow
    this.current++
    cb(null, { current: this.current, ttl: timeWindow - (this.current * 1000) })
  }

  CustomStore.prototype.child = function (routeOptions) {
    const store = new CustomStore(Object.assign(this.options, routeOptions.config.rateLimit))
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

  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '1')
  t.equal(res.headers['x-ratelimit-reset'], '9')

  res = await fastify.inject('/')

  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '0')
  t.equal(res.headers['x-ratelimit-reset'], '8')

  res = await fastify.inject('/')

  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '0')
  t.equal(res.headers['x-ratelimit-reset'], '7')
  t.equal(res.headers['retry-after'], '7')
  t.same({
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 10 seconds'
  }, JSON.parse(res.payload))
})

test('does not override the onRequest', async t => {
  t.plan(4)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: 1000
  })

  fastify.get('/', {
    onRequest: function (req, reply, next) {
      t.pass('onRequest called')
      next()
    }
  }, async (req, reply) => 'hello!')

  const res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '1')
})

test('does not override the onRequest as an array', async t => {
  t.plan(4)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: 1000
  })

  fastify.get('/', {
    onRequest: [function (req, reply, next) {
      t.pass('onRequest called')
      next()
    }]
  }, async (req, reply) => 'hello!')

  const res = await fastify.inject('/')

  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '1')
})

test('variable max', async t => {
  t.plan(4)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: (req, key) => {
      t.pass()
      return +req.headers['secret-max']
    },
    timeWindow: 1000
  })

  fastify.get('/', async (req, res) => 'hello')

  const res = await fastify.inject({ url: '/', headers: { 'secret-max': 50 } })

  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '50')
  t.equal(res.headers['x-ratelimit-remaining'], '49')
})

test('variable max contenders', async t => {
  t.plan(7)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    keyGenerator: (req) => req.headers['api-key'],
    max: (req, key) => key === 'pro' ? 3 : 2,
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
    t.equal(res.statusCode, item.status)
  }
})

test('when passing NaN to max variable then it should use the default max - 1000', async t => {
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
    t.equal(res.statusCode, 200)
    t.equal(res.headers['x-ratelimit-limit'], '1000')
  }

  const res = await fastify.inject('/')
  t.equal(res.statusCode, 429)
  t.equal(res.headers['x-ratelimit-limit'], '1000')
})

test('hide rate limit headers', async t => {
  t.plan(14)
  t.context.clock = FakeTimers.install()
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

  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '1')
  t.equal(res.headers['x-ratelimit-remaining'], '0')
  t.equal(res.headers['x-ratelimit-reset'], '1')

  res = await fastify.inject('/')

  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.notOk(res.headers['x-ratelimit-limit'], 'the header must be missing')
  t.notOk(res.headers['x-ratelimit-remaining'], 'the header must be missing')
  t.notOk(res.headers['x-ratelimit-reset'], 'the header must be missing')
  t.notOk(res.headers['retry-after'], 'the header must be missing')

  t.context.clock.tick(1100)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '1')
  t.equal(res.headers['x-ratelimit-remaining'], '0')
  t.equal(res.headers['x-ratelimit-reset'], '1')

  t.teardown(() => {
    t.context.clock.uninstall()
  })
})

test('hide rate limit headers on exceeding', async t => {
  t.plan(14)
  t.context.clock = FakeTimers.install()
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

  t.equal(res.statusCode, 200)
  t.notOk(res.headers['x-ratelimit-limit'], 'the header must be missing')
  t.notOk(res.headers['x-ratelimit-remaining'], 'the header must be missing')
  t.notOk(res.headers['x-ratelimit-reset'], 'the header must be missing')

  res = await fastify.inject('/')

  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['x-ratelimit-limit'], '1')
  t.equal(res.headers['x-ratelimit-remaining'], '0')
  t.not(res.headers['x-ratelimit-reset'], undefined)
  t.equal(res.headers['retry-after'], '1')

  t.context.clock.tick(1100)

  res = await fastify.inject('/')

  t.equal(res.statusCode, 200)
  t.notOk(res.headers['x-ratelimit-limit'], 'the header must be missing')
  t.notOk(res.headers['x-ratelimit-remaining'], 'the header must be missing')
  t.notOk(res.headers['x-ratelimit-reset'], 'the header must be missing')

  t.teardown(() => {
    t.context.clock.uninstall()
  })
})

test('hide rate limit headers at all times', async t => {
  t.plan(14)
  t.context.clock = FakeTimers.install()
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

  t.equal(res.statusCode, 200)
  t.notOk(res.headers['x-ratelimit-limit'], 'the header must be missing')
  t.notOk(res.headers['x-ratelimit-remaining'], 'the header must be missing')
  t.notOk(res.headers['x-ratelimit-reset'], 'the header must be missing')

  res = await fastify.inject('/')

  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.notOk(res.headers['x-ratelimit-limit'], 'the header must be missing')
  t.notOk(res.headers['x-ratelimit-remaining'], 'the header must be missing')
  t.notOk(res.headers['x-ratelimit-reset'], 'the header must be missing')
  t.notOk(res.headers['retry-after'], 'the header must be missing')

  t.context.clock.tick(1100)

  res = await fastify.inject('/')

  t.equal(res.statusCode, 200)
  t.notOk(res.headers['x-ratelimit-limit'], 'the header must be missing')
  t.notOk(res.headers['x-ratelimit-remaining'], 'the header must be missing')
  t.notOk(res.headers['x-ratelimit-reset'], 'the header must be missing')

  t.teardown(() => {
    t.context.clock.uninstall()
  })
})

test('With ban', async t => {
  t.plan(3)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 1,
    ban: 1
  })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 429)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 403)
})

test('stops fastify lifecycle after onRequest and before preValidation', async t => {
  t.plan(4)
  const fastify = Fastify()
  await fastify.register(rateLimit, { max: 1, timeWindow: 1000 })

  let preValidationCallCount = 0

  fastify.get('/', {
    preValidation: function (req, reply, next) {
      t.pass('preValidation called only once')
      preValidationCallCount++
      next()
    }
  },
  async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 429)
  t.equal(preValidationCallCount, 1)
})

test('With enabled IETF Draft Spec', async t => {
  t.plan(16)
  t.context.clock = FakeTimers.install()
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

  t.equal(res.statusCode, 200)
  t.equal(res.headers['ratelimit-limit'], '2')
  t.equal(res.headers['ratelimit-remaining'], '1')

  res = await fastify.inject('/')

  t.equal(res.statusCode, 200)
  t.equal(res.headers['ratelimit-limit'], '2')
  t.equal(res.headers['ratelimit-remaining'], '0')

  res = await fastify.inject('/')

  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['ratelimit-limit'], '2')
  t.equal(res.headers['ratelimit-remaining'], '0')
  t.equal(res.headers['ratelimit-reset'], res.headers['retry-after'])
  const { ttl, ...payload } = JSON.parse(res.payload)
  t.equal(res.headers['retry-after'], '' + Math.floor(ttl / 1000))
  t.same({
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 1 second'
  }, payload)

  t.context.clock.tick(1100)

  res = await fastify.inject('/')

  t.equal(res.statusCode, 200)
  t.equal(res.headers['ratelimit-limit'], '2')
  t.equal(res.headers['ratelimit-remaining'], '1')

  t.teardown(() => {
    t.context.clock.uninstall()
  })
})

test('hide IETF draft spec headers', async t => {
  t.plan(14)
  t.context.clock = FakeTimers.install()
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

  t.equal(res.statusCode, 200)
  t.equal(res.headers['ratelimit-limit'], '1')
  t.equal(res.headers['ratelimit-remaining'], '0')
  t.equal(res.headers['ratelimit-reset'], '1')

  res = await fastify.inject('/')

  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.notOk(res.headers['ratelimit-limit'], 'the header must be missing')
  t.notOk(res.headers['ratelimit-remaining'], 'the header must be missing')
  t.notOk(res.headers['ratelimit-reset'], 'the header must be missing')
  t.notOk(res.headers['retry-after'], 'the header must be missing')

  t.context.clock.tick(1100)

  res = await fastify.inject('/')

  t.equal(res.statusCode, 200)
  t.equal(res.headers['ratelimit-limit'], '1')
  t.equal(res.headers['ratelimit-remaining'], '0')
  t.equal(res.headers['ratelimit-reset'], '1')

  t.teardown(() => {
    t.context.clock.uninstall()
  })
})

test('afterReset and Rate Limit remain the same when enableDraftSpec is enabled', async t => {
  t.plan(13)
  t.context.clock = FakeTimers.install()
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    max: 1,
    timeWindow: '10s',
    enableDraftSpec: true
  })

  fastify.get('/', async (req, reply) => 'hello!')

  const res = await fastify.inject('/')

  t.equal(res.statusCode, 200)
  t.equal(res.headers['ratelimit-limit'], '1')
  t.equal(res.headers['ratelimit-remaining'], '0')

  t.context.clock.tick(500)
  await retry('10')

  t.context.clock.tick(1000)
  await retry('9')

  async function retry (timeLeft) {
    const res = await fastify.inject('/')

    t.equal(res.statusCode, 429)
    t.equal(res.headers['ratelimit-limit'], '1')
    t.equal(res.headers['ratelimit-remaining'], '0')
    t.equal(res.headers['ratelimit-reset'], timeLeft)
    t.equal(res.headers['ratelimit-reset'], res.headers['retry-after'])
  }

  t.teardown(() => {
    t.context.clock.uninstall()
  })
})

test('Before async in "max"', async t => {
  const fastify = Fastify()
  await await fastify.register(rateLimit, {
    keyGenerator: (req) => req.headers['api-key'],
    max: async (req, key) => requestSequence(key),
    timeWindow: 10000
  })

  await fastify.get('/', async (req, res) => 'hello')

  const requestSequence = async (key) => await key === 'pro' ? 5 : 2
})

test('exposeHeadRoutes', async t => {
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

  t.equal(res.statusCode, 200, 'GET: Response status code')
  t.equal(res.headers['x-ratelimit-limit'], '10', 'GET: x-ratelimit-limit header (global rate limit)')
  t.equal(res.headers['x-ratelimit-remaining'], '9', 'GET: x-ratelimit-remaining header (global rate limit)')

  t.equal(resHead.statusCode, 200, 'HEAD: Response status code')
  t.equal(resHead.headers['x-ratelimit-limit'], '10', 'HEAD: x-ratelimit-limit header (global rate limit)')
  t.equal(resHead.headers['x-ratelimit-remaining'], '8', 'HEAD: x-ratelimit-remaining header (global rate limit)')
})

test('When continue exceeding is on (Local)', async t => {
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

  t.equal(first.statusCode, 200)

  t.equal(second.statusCode, 429)
  t.equal(second.headers['x-ratelimit-limit'], '1')
  t.equal(second.headers['x-ratelimit-remaining'], '0')
  t.equal(second.headers['x-ratelimit-reset'], '5')
})

test('When continue exceeding is on (Redis)', async t => {
  const fastify = Fastify()
  const redis = new Redis({ host: REDIS_HOST })

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

  t.equal(first.statusCode, 200)

  t.equal(second.statusCode, 429)
  t.equal(second.headers['x-ratelimit-limit'], '1')
  t.equal(second.headers['x-ratelimit-remaining'], '0')
  t.equal(second.headers['x-ratelimit-reset'], '5')

  t.teardown(async () => {
    await redis.flushall()
    await redis.quit()
  })
})

test('Redis with continueExceeding should not always return the timeWindow as ttl', async t => {
  t.plan(19)
  const fastify = Fastify()
  const redis = new Redis({ host: REDIS_HOST })
  await fastify.register(rateLimit, {
    max: 2,
    timeWindow: 3000,
    continueExceeding: true,
    redis
  })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '1')
  t.equal(res.headers['x-ratelimit-reset'], '3')

  // After this sleep, we should not see `x-ratelimit-reset === 3` anymore
  await sleep(1000)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '0')
  t.equal(res.headers['x-ratelimit-reset'], '2')

  res = await fastify.inject('/')
  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '0')
  t.equal(res.headers['x-ratelimit-reset'], '3')
  t.equal(res.headers['retry-after'], '3')
  t.same({
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 3 seconds'
  }, JSON.parse(res.payload))

  // Not using fake timers here as we use an external Redis that would not be effected by this
  await sleep(1000)

  res = await fastify.inject('/')

  t.equal(res.statusCode, 429)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '0')
  t.equal(res.headers['x-ratelimit-reset'], '3')

  t.teardown(async () => {
    await redis.flushall()
    await redis.quit()
  })
})

test('When use a custom nameSpace', async t => {
  const fastify = Fastify()
  const redis = new Redis({ host: REDIS_HOST })

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
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '1')
  t.equal(res.headers['x-ratelimit-reset'], '1')

  res = await fastify.inject(allowListHeader)
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '0')
  t.equal(res.headers['x-ratelimit-reset'], '1')

  res = await fastify.inject(allowListHeader)
  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '0')
  t.equal(res.headers['x-ratelimit-reset'], '1')
  t.equal(res.headers['retry-after'], '1')
  t.same({
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 1 second'
  }, JSON.parse(res.payload))

  // Not using fake timers here as we use an external Redis that would not be effected by this
  await sleep(1100)

  res = await fastify.inject(allowListHeader)

  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '1')
  t.equal(res.headers['x-ratelimit-reset'], '1')

  t.teardown(async () => {
    await redis.flushall()
    await redis.quit()
  })
})

test('on preHandler hook', async t => {
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
  fastify.addHook('preHandler', async req => {
    const { userId } = req.query
    if (userId) {
      req.userId = userId
    }
  })

  fastify.get('/', async (req, reply) => 'fastify is awesome !')

  const send = userId => {
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

  t.equal(first.statusCode, 200)
  t.equal(second.statusCode, 429)
  t.equal(third.statusCode, 200)
  t.equal(fourth.statusCode, 429)
  t.equal(fifth.statusCode, 200)
})

test('ban directly', async t => {
  t.plan(15)
  t.context.clock = FakeTimers.install()
  const fastify = Fastify()
  await fastify.register(rateLimit, { max: 2, ban: 0, timeWindow: '1s' })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')

  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '1')

  res = await fastify.inject('/')

  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject('/')

  t.equal(res.statusCode, 403)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '0')
  t.equal(res.headers['retry-after'], '1')
  t.same({
    statusCode: 403,
    error: 'Forbidden',
    message: 'Rate limit exceeded, retry in 1 second'
  }, JSON.parse(res.payload))

  t.context.clock.tick(1100)

  res = await fastify.inject('/')

  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '1')

  t.teardown(() => {
    t.context.clock.uninstall()
  })
})

test('wrong timewindow', async t => {
  t.plan(15)
  t.context.clock = FakeTimers.install()
  const fastify = Fastify()
  await fastify.register(rateLimit, { max: 2, ban: 0, timeWindow: '1s' })

  fastify.get('/', {
    config: {
      rateLimit: {
        timeWindow: -5
      }
    }
  }, async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')

  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '1')

  res = await fastify.inject('/')

  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject('/')

  t.equal(res.statusCode, 403)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '0')
  t.equal(res.headers['retry-after'], '60')
  t.same({
    statusCode: 403,
    error: 'Forbidden',
    message: 'Rate limit exceeded, retry in 1 minute'
  }, JSON.parse(res.payload))

  t.context.clock.tick(1100)

  res = await fastify.inject('/')

  t.equal(res.statusCode, 403)
  t.equal(res.headers['x-ratelimit-limit'], '2')
  t.equal(res.headers['x-ratelimit-remaining'], '0')

  t.teardown(() => {
    t.context.clock.uninstall()
  })
})
