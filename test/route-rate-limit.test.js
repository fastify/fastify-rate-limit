'use strict'

const t = require('tap')
const test = t.test
const Redis = require('ioredis')
const Fastify = require('fastify')
const rateLimit = require('../index')
const FakeTimers = require('@sinonjs/fake-timers')

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const noop = () => { }

const REDIS_HOST = '127.0.0.1'

const defaultRouteConfig = {
  rateLimit: {
    max: 2,
    timeWindow: 1000
  },
  someOtherPlugin: {
    someValue: 1
  }
}

test('Basic', async t => {
  t.plan(21)
  t.context.clock = FakeTimers.install()
  const fastify = Fastify()
  fastify.register(rateLimit, { global: false })

  fastify.get('/', {
    config: defaultRouteConfig
  }, async (req, reply) => 'hello!')

  fastify.setErrorHandler(function (error, request, reply) {
    t.pass('Error handler has been called')
    t.equal(reply.statusCode, 429)
    error.message += ' from error handler'
    reply.send(error)
  })

  let res

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 1)
  t.equal(res.headers['x-ratelimit-reset'], 1)

  // Ticking time to simulate time been passed, passing `shouldAdvanceTime: true` won't help as between the 2 requests
  // the event loop not reached the timer stage and is not able to run the `setInterval` that sinonjs/fake-timers use internally to update the time
  t.context.clock.tick(1)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 0)
  t.equal(res.headers['x-ratelimit-reset'], 0)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 0)
  t.equal(res.headers['retry-after'], 1000)
  t.equal(res.headers['x-ratelimit-reset'], 0)
  t.same({
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 1 second from error handler'
  }, JSON.parse(res.payload))

  t.context.clock.tick(1100)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 1)
  t.equal(res.headers['x-ratelimit-reset'], 1)

  t.teardown(() => {
    t.context.clock.uninstall()
  })
})

test('With text timeWindow', async t => {
  t.plan(15)
  t.context.clock = FakeTimers.install()
  const fastify = Fastify()
  fastify.register(rateLimit, { global: false })

  fastify.get('/', {
    config: defaultRouteConfig
  }, async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 1)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 0)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 0)
  t.equal(res.headers['retry-after'], 1000)
  t.same(JSON.parse(res.payload), {
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 1 second'
  })

  t.context.clock.tick(1100)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 1)

  t.teardown(() => {
    t.context.clock.uninstall()
  })
})

test('With ips allowList', async t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(rateLimit, {
    global: false,
    allowList: ['127.0.0.1']
  })

  fastify.get('/', {
    config: defaultRouteConfig
  }, async (req, reply) => 'hello!')

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
  fastify.register(rateLimit, {
    global: false,
    keyGenerator: () => 42,
    allowList: (req, key) => {
      t.ok(req.headers)
      t.equal(key, 42)
      return req.headers['x-my-header'] !== undefined
    }
  })

  fastify.get('/', {
    config: defaultRouteConfig
  }, async (req, reply) => 'hello!')

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

test('With redis store', async t => {
  t.plan(19)
  const fastify = Fastify()
  const redis = new Redis({ host: REDIS_HOST })
  fastify.register(rateLimit, {
    global: false,
    redis: redis
  })

  fastify.get('/', {
    config: defaultRouteConfig
  }, async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 1)
  t.equal(res.headers['x-ratelimit-reset'], 1)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 0)
  t.equal(res.headers['x-ratelimit-reset'], 0)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 0)
  t.equal(res.headers['retry-after'], 1000)
  t.equal(res.headers['x-ratelimit-reset'], 0)
  t.same({
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 1 second'
  }, JSON.parse(res.payload))

  // Not using fake timers here as we use an external Redis that would not be effected by this
  await sleep(1100)

  res = await fastify.inject('/')
  redis.flushall(noop)
  redis.quit(noop)
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 1)
  t.equal(res.headers['x-ratelimit-reset'], 1)
})

test('Skip on redis error', async t => {
  t.plan(9)
  const fastify = Fastify()
  const redis = new Redis({ host: REDIS_HOST })
  fastify.register(rateLimit, {
    redis: redis,
    global: false
  })

  fastify.get('/', {
    config: {
      rateLimit: {
        max: 2,
        timeWindow: 1000,
        skipOnError: true
      }
    }
  }, async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 1)

  redis.flushall(noop)
  await redis.quit()

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 2)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 2)
})

test('With keyGenerator', async t => {
  t.plan(19)
  t.context.clock = FakeTimers.install()
  const fastify = Fastify()
  fastify.register(rateLimit, {
    global: false,
    keyGenerator: (req) => {
      t.equal(req.headers['my-custom-header'], 'random-value')
      return req.headers['my-custom-header']
    }
  })

  fastify.get('/', {
    config: defaultRouteConfig
  }, async (req, reply) => 'hello!')

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
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 1)

  res = await fastify.inject(payload)
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 0)

  res = await fastify.inject(payload)
  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 0)
  t.equal(res.headers['retry-after'], 1000)
  t.same({
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 1 second'
  }, JSON.parse(res.payload))

  t.context.clock.tick(1100)

  res = await fastify.inject(payload)
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 1)

  t.teardown(() => {
    t.context.clock.uninstall()
  })
})

test('no rate limit without settings', async t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(rateLimit, { global: false })

  fastify.get('/', async (req, reply) => 'hello!')

  const res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], undefined)
  t.equal(res.headers['x-ratelimit-remaining'], undefined)
})

test('no rate limit with bad rate-limit parameters', t => {
  t.plan(1)
  const fastify = Fastify()
  fastify.register(rateLimit, { max: 2, timeWindow: 1000 })

  fastify.get('/', {
    config: Object.assign({}, defaultRouteConfig, { rateLimit: () => { } })
  }, async (req, reply) => 'hello!')

  fastify.ready((err) => {
    t.equal(err.message, 'Unknown value for route rate-limit configuration')
  })
})

test('works with existing route config', async t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(rateLimit, { max: 2, timeWindow: 1000 })

  fastify.get('/', {
    config: defaultRouteConfig
  }, async (req, reply) => 'hello!')

  await fastify.ready()
  const res = await fastify.inject('/')
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 1)
})

test('With ban', async t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(rateLimit, {
    global: false
  })

  fastify.get('/', {
    config: { rateLimit: { max: 1, ban: 1 } }
  }, async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 429)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 403)
})

test('route can disable the global limit', async t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(rateLimit, { max: 2, timeWindow: 1000 })

  fastify.get('/', {
    config: Object.assign({}, defaultRouteConfig, { rateLimit: false })
  }, async (req, reply) => 'hello!')

  const res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], undefined)
  t.equal(res.headers['x-ratelimit-remaining'], undefined)
})

test('does not override onRequest', async t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(rateLimit, { global: false })

  fastify.get('/', {
    onRequest: function (req, reply, next) {
      t.pass('onRequest called')
      next()
    },
    config: defaultRouteConfig
  }, async (req, reply) => 'hello!')

  const res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 1)
})

test('onExceeding and onExceeded events', async t => {
  t.plan(11)

  let onExceedingCounter = 0
  let onExceededCounter = 0
  const fastify = Fastify()
  fastify.register(rateLimit, { global: false })

  fastify.get('/', {
    config: Object.assign({}, defaultRouteConfig, {
      rateLimit: {
        max: 2,
        timeWindow: 1000,
        onExceeding: function (req) {
          // it will be executed 2 times
          t.ok(req, 'req should be not null')
          onExceedingCounter += 1
        },
        onExceeded: function (req) {
          // it will be executed 2 times
          t.ok(req, 'req should be not null')
          onExceededCounter += 1
        }
      }
    })
  }, async (req, reply) => 'hello!')

  const payload = { method: 'GET', url: '/' }

  let res

  res = await fastify.inject(payload)
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-remaining'], 1)

  res = await fastify.inject(payload)
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-remaining'], 0)

  res = await fastify.inject(payload)
  t.equal(res.statusCode, 429)
  t.equal(res.headers['x-ratelimit-remaining'], 0)

  t.equal(onExceedingCounter, 2)
  t.equal(onExceededCounter, 1)
})

test('custom error response', async t => {
  t.plan(12)
  const fastify = Fastify()
  fastify.register(rateLimit, {
    global: false,
    errorResponseBuilder: (req, context) => ({
      code: 429,
      timeWindow: context.after,
      limit: context.max
    })
  })

  fastify.get('/', {
    config: {
      rateLimit: {
        max: 2,
        timeWindow: 1000
      }
    }
  }, async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 1)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 0)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 0)
  t.equal(res.headers['retry-after'], 1000)
  t.same(JSON.parse(res.payload), {
    code: 429,
    timeWindow: '1 second',
    limit: 2
  })
})

test('variable max contenders', async t => {
  t.plan(9)
  const fastify = Fastify()
  fastify.register(rateLimit, {
    global: false,
    max: 1,
    timeWindow: 10000
  })

  fastify.get('/', {
    config: {
      rateLimit: {
        keyGenerator: (req) => req.headers['api-key'],
        max: (req, key) => key === 'pro' ? 3 : 2
      }
    }
  }, async (req, reply) => 'hello')

  fastify.get('/limit', { config: { rateLimit: {} } }, async (req, res) => 'limited')

  const requestSequence = [
    { headers: { 'api-key': 'pro' }, status: 200, url: '/' },
    { headers: { 'api-key': 'pro' }, status: 200, url: '/' },
    { headers: { 'api-key': 'pro' }, status: 200, url: '/' },
    { headers: { 'api-key': 'pro' }, status: 429, url: '/' },
    { headers: { 'api-key': 'pro' }, status: 200, url: '/limit' },
    { headers: { 'api-key': 'pro' }, status: 429, url: '/limit' },
    { headers: { 'api-key': 'NOT' }, status: 200, url: '/' },
    { headers: { 'api-key': 'NOT' }, status: 200, url: '/' },
    { headers: { 'api-key': 'NOT' }, status: 429, url: '/' }
  ]

  for (const item of requestSequence) {
    const res = await fastify.inject({ url: item.url, headers: item.headers })
    t.equal(res.statusCode, item.status)
  }
})

// TODO this test gets extremely flaky because of setTimeout
// rewrite using https://www.npmjs.com/package/@sinonjs/fake-timers
test('limit reset per Local storage', { skip: true }, t => {
  t.plan(12)
  const fastify = Fastify()
  fastify.register(rateLimit, { global: false })

  fastify.get('/', {
    config: {
      rateLimit: {
        max: 1,
        timeWindow: 4000
      }
    }
  }, (req, reply) => {
    reply.send('hello!')
  })

  setTimeout(doRequest.bind(null, 4), 0)
  setTimeout(doRequest.bind(null, 3), 1000)
  setTimeout(doRequest.bind(null, 2), 2000)
  setTimeout(doRequest.bind(null, 1), 3000)
  setTimeout(doRequest.bind(null, 0), 4000)
  setTimeout(doRequest.bind(null, 4), 4100)

  function doRequest (resetValue) {
    fastify.inject('/', (err, res) => {
      t.error(err)
      t.equal(res.headers['x-ratelimit-reset'], resetValue)
    })
  }
})

test('hide rate limit headers', async t => {
  t.plan(14)
  t.context.clock = FakeTimers.install()
  const fastify = Fastify()
  fastify.register(rateLimit, {
    max: 1,
    timeWindow: 1000,
    addHeaders: {
      'x-ratelimit-limit': false,
      'x-ratelimit-remaining': false,
      'x-ratelimit-reset': false,
      'retry-after': false
    }
  })

  fastify.get('/', {
    config: {
      rateLimit: {
        timeWindow: 1000,
        addHeaders: {
          'x-ratelimit-limit': true, // this must override the global one
          'x-ratelimit-remaining': false,
          'x-ratelimit-reset': false,
          'retry-after': false
        }
      }
    }
  }, async (req, res) => 'hello')

  let res

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 1)
  t.equal(res.headers['x-ratelimit-remaining'], 0)
  t.equal(res.headers['x-ratelimit-reset'], 1)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['x-ratelimit-limit'], 1)
  t.notOk(res.headers['x-ratelimit-remaining'], 'the header must be missing')
  t.notOk(res.headers['x-ratelimit-reset'], 'the header must be missing')
  t.notOk(res.headers['retry-after'], 'the header must be missing')

  t.context.clock.tick(1100)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 1)
  t.equal(res.headers['x-ratelimit-remaining'], 0)
  t.equal(res.headers['x-ratelimit-reset'], 1)

  t.teardown(() => {
    t.context.clock.uninstall()
  })
})

test('hide rate limit headers on exceeding', async t => {
  t.plan(14)
  t.context.clock = FakeTimers.install()
  const fastify = Fastify()
  fastify.register(rateLimit, {
    max: 1,
    timeWindow: 1000,
    addHeadersOnExceeding: {
      'x-ratelimit-limit': false,
      'x-ratelimit-remaining': false,
      'x-ratelimit-reset': false
    }
  })

  fastify.get('/', {
    config: {
      rateLimit: {
        timeWindow: 1000,
        addHeadersOnExceeding: {
          'x-ratelimit-limit': true, // this must override the global one
          'x-ratelimit-remaining': false,
          'x-ratelimit-reset': false
        }
      }
    }
  }, async (req, res) => 'hello')

  let res

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 1)
  t.notOk(res.headers['x-ratelimit-remaining'], 'the header must be missing')
  t.notOk(res.headers['x-ratelimit-reset'], 'the header must be missing')

  res = await fastify.inject('/')
  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['x-ratelimit-limit'], 1)
  t.equal(res.headers['x-ratelimit-remaining'], 0)
  t.not(res.headers['x-ratelimit-reset'], undefined)
  t.equal(res.headers['retry-after'], 1000)

  t.context.clock.tick(1100)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 1)
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
  fastify.register(rateLimit, {
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

  fastify.get('/', {
    config: {
      rateLimit: {
        timeWindow: 1000,
        addHeaders: {
          'x-ratelimit-limit': true, // this must override the global one
          'x-ratelimit-remaining': false,
          'x-ratelimit-reset': false,
          'retry-after': false
        },
        addHeadersOnExceeding: {
          'x-ratelimit-limit': false,
          'x-ratelimit-remaining': true, // this must override the global one
          'x-ratelimit-reset': false
        }
      }
    }
  }, async (req, res) => 'hello')

  let res

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.notOk(res.headers['x-ratelimit-limit'], 'the header must be missing')
  t.equal(res.headers['x-ratelimit-remaining'], 0)
  t.notOk(res.headers['x-ratelimit-reset'], 'the header must be missing')

  res = await fastify.inject('/')
  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['x-ratelimit-limit'], 1)
  t.notOk(res.headers['x-ratelimit-remaining'], 'the header must be missing')
  t.notOk(res.headers['x-ratelimit-reset'], 'the header must be missing')
  t.notOk(res.headers['retry-after'], 'the header must be missing')

  t.context.clock.tick(1100)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.notOk(res.headers['x-ratelimit-limit'], 'the header must be missing')
  t.equal(res.headers['x-ratelimit-remaining'], 0)
  t.notOk(res.headers['x-ratelimit-reset'], 'the header must be missing')

  t.teardown(() => {
    t.context.clock.uninstall()
  })
})

test('global timeWindow when not set in routes', async t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(rateLimit, {
    global: false,
    timeWindow: 6000
  })

  fastify.get('/six', {
    config: { rateLimit: { max: 6 } }
  }, async (req, res) => 'hello!')

  fastify.get('/four', {
    config: { rateLimit: { max: 4, timeWindow: 4000 } }
  }, async (req, res) => 'hello!')

  let res

  res = await fastify.inject('/six')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-reset'], 6)

  res = await fastify.inject('/four')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-reset'], 4)
})

test('timeWindow specified as a string', async t => {
  t.plan(9)
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
    const store = new CustomStore(Object.assign(this.options, routeOptions))
    return store
  }

  const fastify = Fastify()
  fastify.register(rateLimit, {
    global: false,
    store: CustomStore
  })

  fastify.get('/', {
    config: { rateLimit: { max: 2, timeWindow: '10 seconds' } }
  }, async (req, res) => 'hello!')

  let res

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 1)
  t.equal(res.headers['x-ratelimit-reset'], 9)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 0)
  t.equal(res.headers['x-ratelimit-reset'], 8)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 429)
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
    const store = new CustomStore(Object.assign(this.options, routeOptions))
    return store
  }

  const fastify = Fastify()
  fastify.register(rateLimit, {
    global: false,
    max: 1,
    timeWindow: 10000,
    store: CustomStore
  })

  fastify.get('/', {
    config: { rateLimit: { max: 2, timeWindow: 10000 } }
  }, async (req, res) => 'hello!')

  let res

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 1)
  t.equal(res.headers['x-ratelimit-reset'], 9)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 0)
  t.equal(res.headers['x-ratelimit-reset'], 8)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 0)
  t.equal(res.headers['x-ratelimit-reset'], 7)
  t.equal(res.headers['retry-after'], 10000)
  t.same({
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 10 seconds'
  }, JSON.parse(res.payload))
})

test('stops fastify lifecycle after onRequest and before preValidation', async t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(rateLimit, { global: false })

  let preValidationCallCount = 0

  fastify.get('/', {
    config: {
      rateLimit: {
        max: 1,
        timeWindow: 1000
      }
    },
    preValidation: function (req, reply, next) {
      t.pass('preValidation called only once')
      preValidationCallCount++
      next()
    }
  }, async (req, res) => 'hello!')

  let res

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 429)
  t.equal(preValidationCallCount, 1)
})

test('avoid double onRequest', async t => {
  t.plan(3)

  const fastify = Fastify()

  let keyGeneratorCallCount = 0

  const subroute = async (childServer) => {
    childServer.register(rateLimit, {
      max: 1,
      timeWindow: 1000,
      keyGenerator: (req) => {
        t.pass('keyGenerator called only once')
        keyGeneratorCallCount++

        return req.ip
      }
    })

    childServer.get('/', {}, async (req, reply) => 'hello!')
  }

  fastify.register(subroute, { prefix: '/test' })

  const res = await fastify.inject({
    url: '/test',
    method: 'GET'
  })
  t.equal(res.statusCode, 200)
  t.equal(keyGeneratorCallCount, 1)
})

test('Allow multiple different rate limiter registrations', async t => {
  t.plan(16)
  const fastify = Fastify()

  fastify.register(rateLimit, {
    max: 1,
    timeWindow: 1000,
    whitelist: (req) => req.url !== '/test'
  })

  fastify.register(rateLimit, {
    max: 1,
    timeWindow: 1000,
    whitelist: (req) => req.url === '/test'
  })

  fastify.get('/', async (req, reply) => 'hello!')

  fastify.get('/test', async (req, reply) => 'hello from another route!')

  let res

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 1)
  t.equal(res.headers['x-ratelimit-remaining'], 0)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['x-ratelimit-limit'], 1)
  t.equal(res.headers['x-ratelimit-remaining'], 0)
  t.equal(res.headers['retry-after'], 1000)

  res = await fastify.inject('/test')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 1)
  t.equal(res.headers['x-ratelimit-remaining'], 0)

  res = await fastify.inject('/test')
  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['x-ratelimit-limit'], 1)
  t.equal(res.headers['x-ratelimit-remaining'], 0)
  t.equal(res.headers['retry-after'], 1000)
})

test('With enable IETF draft spec', async t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(rateLimit, {
    global: false,
    enableDraftSpec: true
  })

  fastify.get('/', {
    config: defaultRouteConfig
  }, async (req, res) => 'hello!')

  const res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['ratelimit-limit'], 2)
  t.equal(res.headers['ratelimit-remaining'], 1)
  t.equal(res.headers['ratelimit-reset'], 1)
})

test('per route rate limit', async t => {
  const fastifyR = Fastify({
    exposeHeadRoutes: true
  })
  fastifyR.register(rateLimit, { global: false })

  fastifyR.get('/', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: 1000
      }
    }
  }, async (req, reply) => 'hello!')

  const res = await fastifyR.inject({
    url: '/',
    method: 'GET'
  })

  const resHead = await fastifyR.inject({
    url: '/',
    method: 'HEAD'
  })

  t.equal(res.statusCode, 200, 'GET: Response status code')
  t.equal(res.headers['x-ratelimit-limit'], 10, 'GET: x-ratelimit-limit header (per route limit)')
  t.equal(res.headers['x-ratelimit-remaining'], 9, 'GET: x-ratelimit-remaining header (per route limit)')

  t.equal(resHead.statusCode, 200, 'HEAD: Response status code')
  t.equal(resHead.headers['x-ratelimit-limit'], 10, 'HEAD: x-ratelimit-limit header (per route limit)')
  t.equal(resHead.headers['x-ratelimit-remaining'], 8, 'HEAD: x-ratelimit-remaining header (per route limit)')
})

test('Allow custom timeWindow in preHandler', async t => {
  t.plan(21)
  const fastify = Fastify()
  fastify.register(rateLimit, { global: false })
  fastify.register((fastify, options, done) => {
    fastify.get('/default', {
      config: { rateLimit: { max: 1, timeWindow: '10 seconds' } }
    }, async (req, reply) => 'Global rateLimiter should limit this with 60seconds timeWindow')
    fastify.route({
      method: 'GET',
      url: '/2',
      preHandler: [
        fastify.rateLimit({
          max: 1,
          timeWindow: '2 minutes',
          keyGenerator: (request) => 245
        })
      ],

      handler: async (request, reply) => ({ hello: 'world' })
    })

    fastify.route({
      method: 'GET',
      url: '/3',
      preHandler: [
        fastify.rateLimit({
          max: 1,
          timeWindow: '3 minutes',
          keyGenerator: (request) => 345
        })
      ],

      handler: async (request, reply) => ({ hello: 'world' })
    })

    done()
  })

  let res = await fastify.inject('/2')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 1)
  t.equal(res.headers['x-ratelimit-remaining'], 0)

  res = await fastify.inject('/2')
  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['x-ratelimit-limit'], 1)
  t.equal(res.headers['x-ratelimit-remaining'], 0)
  t.equal(res.headers['retry-after'], 120000)

  res = await fastify.inject('/3')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 1)
  t.equal(res.headers['x-ratelimit-remaining'], 0)

  res = await fastify.inject('/3')
  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['x-ratelimit-limit'], 1)
  t.equal(res.headers['x-ratelimit-remaining'], 0)
  t.equal(res.headers['retry-after'], 180000)

  res = await fastify.inject('/default')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 1)
  t.equal(res.headers['x-ratelimit-remaining'], 0)

  res = await fastify.inject('/default')
  t.equal(res.headers['retry-after'], 10000)
  t.equal(res.statusCode, 429)
})

test('When continue exceeding is on (Local)', async t => {
  const fastify = Fastify()

  fastify.register(rateLimit, {
    global: false
  })

  fastify.get('/', {
    config: {
      rateLimit: {
        max: 1,
        timeWindow: 5000,
        continueExceeding: true
      }
    }
  }, async (req, reply) => 'hello!')

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
  t.equal(second.headers['x-ratelimit-limit'], 1)
  t.equal(second.headers['x-ratelimit-remaining'], 0)
  t.equal(second.headers['x-ratelimit-reset'], 5)
})

test('When continue exceeding is on (Redis)', async t => {
  const fastify = Fastify()
  const redis = await new Redis({ host: REDIS_HOST })

  fastify.register(rateLimit, {
    global: false,
    redis: redis
  })

  fastify.get('/', {
    config: {
      rateLimit: {
        timeWindow: 5000,
        max: 1,
        continueExceeding: true
      }
    }
  }, async (req, reply) => 'hello!')

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
  t.equal(second.headers['x-ratelimit-limit'], 1)
  t.equal(second.headers['x-ratelimit-remaining'], 0)
  t.equal(second.headers['x-ratelimit-reset'], 5)

  t.teardown(() => {
    redis.flushall(noop)
    redis.quit(noop)
  })
})

test('should consider routes allow list', t => {
  t.plan(6)
  const fastify = Fastify()
  fastify.register(rateLimit, {
    global: false
  })

  fastify.get('/', {
    config: { rateLimit: { allowList: ['127.0.0.1'], max: 2, timeWindow: 10000 } }
  }, (req, reply) => {
    reply.send('hello!')
  })

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)

    fastify.inject('/', (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 200)

      fastify.inject('/', (err, res) => {
        t.error(err)
        t.equal(res.statusCode, 200)
      })
    })
  })
})

test('on preValidation hook', async t => {
  const fastify = Fastify()

  fastify.register(rateLimit, {
    global: false
  })

  fastify.get('/quero', {
    config: {
      rateLimit: {
        max: 1,
        timeWindow: 10000,
        hook: 'preValidation',
        keyGenerator (req) {
          return req.userId || req.ip
        }
      }
    }
  }, async (req, reply) => 'fastify is awesome !')

  fastify.decorateRequest('userId', '')
  fastify.addHook('preParsing', async req => {
    const { userId } = req.query
    if (userId) {
      req.userId = userId
    }
  })

  const send = userId => {
    let query
    if (userId) {
      query = { userId }
    }
    return fastify.inject({
      url: '/quero',
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
