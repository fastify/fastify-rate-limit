'use strict'

const { mock } = require('node:test')
const tap = require('tap')
const assert = require('node:assert')
const Fastify = require('fastify')
const rateLimit = require('../index')

const defaultRouteConfig = {
  rateLimit: {
    max: 2,
    timeWindow: 1000
  },
  someOtherPlugin: {
    someValue: 1
  }
}

tap.test('Basic', async (t) => {
  t.plan(20)

  const clock = mock.timers
  clock.enable(0)

  const fastify = Fastify()
  await fastify.register(rateLimit, { global: false })

  fastify.get(
    '/',
    {
      config: defaultRouteConfig
    },
    async (req, reply) => 'hello!'
  )

  fastify.setErrorHandler(function (error, request, reply) {
    // assert.ok('Error handler has been called')
    assert.deepStrictEqual(error.statusCode, 429)
    reply.code(429)
    error.message += ' from error handler'
    reply.send(error)
  })

  let res

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
  assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

  // Ticking time to simulate time been passed, passing `shouldAdvanceTime: true` won't help as between the 2 requests
  // the event loop not reached the timer stage and is not able to run the `setInterval` that sinonjs/fake-timers use internally to update the time
  clock.tick(1)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

  clock.tick(500)

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
      message: 'Rate limit exceeded, retry in 1 second from error handler'
    },
    JSON.parse(res.payload)
  )

  clock.tick(1100)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
  assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

  clock.reset()
})

tap.test('With text timeWindow', async (t) => {
  t.plan(15)
  const clock = mock.timers
  clock.enable(0)
  const fastify = Fastify()
  await fastify.register(rateLimit, { global: false })

  fastify.get(
    '/',
    {
      config: {
        rateLimit: {
          max: 2,
          timeWindow: '1s'
        },
        someOtherPlugin: {
          someValue: 1
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
  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  assert.deepStrictEqual(res.headers['retry-after'], '1')
  assert.deepStrictEqual(JSON.parse(res.payload), {
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 1 second'
  })

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
  await fastify.register(rateLimit, { global: false })

  fastify.get(
    '/',
    {
      config: {
        rateLimit: {
          max: 2,
          timeWindow: (_, __) => 1000
        },
        someOtherPlugin: {
          someValue: 1
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
  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  assert.deepStrictEqual(res.headers['retry-after'], '1')
  assert.deepStrictEqual(JSON.parse(res.payload), {
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 1 second'
  })

  clock.tick(1100)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  clock.reset()
})

tap.test('With ips allowList', async (t) => {
  t.plan(3)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    allowList: ['127.0.0.1']
  })

  fastify.get(
    '/',
    {
      config: defaultRouteConfig
    },
    async (req, reply) => 'hello!'
  )

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
    global: false,
    keyGenerator: () => 42,
    allowList: (req, key) => {
      assert.ok(req.headers)
      assert.deepStrictEqual(key, 42)
      return req.headers['x-my-header'] !== undefined
    }
  })

  fastify.get(
    '/',
    {
      config: defaultRouteConfig
    },
    async (req, reply) => 'hello!'
  )

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
  await fastify.register(rateLimit, { global: false })

  fastify.get(
    '/',
    {
      config: {
        rateLimit: {
          max: 2,
          timeWindow: '2s',
          onExceeding: function (req) {
            assert.ok('onExceeding called')
          }
        }
      }
    },
    async (req, res) => 'hello!'
  )

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
  await fastify.register(rateLimit, { global: false })

  fastify.get(
    '/',
    {
      config: {
        rateLimit: {
          max: 2,
          timeWindow: '2s',
          onExceeded: function (req) {
            assert.ok('onExceeded called')
          }
        }
      }
    },
    async (req, res) => 'hello!'
  )

  let res

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 429)
})

tap.test('With keyGenerator', async (t) => {
  t.plan(19)
  const clock = mock.timers
  clock.enable(0)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    keyGenerator: (req) => {
      assert.deepStrictEqual(req.headers['my-custom-header'], 'random-value')
      return req.headers['my-custom-header']
    }
  })

  fastify.get(
    '/',
    {
      config: defaultRouteConfig
    },
    async (req, reply) => 'hello!'
  )

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

tap.test('no rate limit without settings', async (t) => {
  t.plan(3)
  const fastify = Fastify()
  await fastify.register(rateLimit, { global: false })

  fastify.get('/', async (req, reply) => 'hello!')

  const res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], undefined)
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], undefined)
})

tap.test('no rate limit with bad rate-limit parameters', async (t) => {
  t.plan(1)
  const fastify = Fastify()
  await fastify.register(rateLimit, { max: 2, timeWindow: 1000 })

  try {
    fastify.get(
      '/',
      {
        config: Object.assign({}, defaultRouteConfig, { rateLimit: () => {} })
      },
      async (req, reply) => 'hello!'
    )

    t.fail('should throw')
  } catch (err) {
    assert.deepStrictEqual(
      err.message,
      'Unknown value for route rate-limit configuration'
    )
  }
})

tap.test('works with existing route config', async (t) => {
  t.plan(2)
  const fastify = Fastify()
  await fastify.register(rateLimit, { max: 2, timeWindow: 1000 })

  fastify.get(
    '/',
    {
      config: defaultRouteConfig
    },
    async (req, reply) => 'hello!'
  )

  await fastify.ready()
  const res = await fastify.inject('/')
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
})

tap.test('With ban', async (t) => {
  t.plan(3)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false
  })

  fastify.get(
    '/',
    {
      config: { rateLimit: { max: 1, ban: 1 } }
    },
    async (req, reply) => 'hello!'
  )

  let res

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 429)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 403)
})

tap.test('route can disable the global limit', async (t) => {
  t.plan(3)
  const fastify = Fastify()
  await fastify.register(rateLimit, { max: 2, timeWindow: 1000 })

  fastify.get(
    '/',
    {
      config: Object.assign({}, defaultRouteConfig, { rateLimit: false })
    },
    async (req, reply) => 'hello!'
  )

  const res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], undefined)
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], undefined)
})

tap.test('does not override onRequest', async (t) => {
  t.plan(4)
  const fastify = Fastify()
  await fastify.register(rateLimit, { global: false })

  fastify.get(
    '/',
    {
      onRequest: function (req, reply, next) {
        assert.ok('onRequest called')
        next()
      },
      config: defaultRouteConfig
    },
    async (req, reply) => 'hello!'
  )

  const res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
})

tap.test('onExceeding and onExceeded events', async (t) => {
  t.plan(11)

  let onExceedingCounter = 0
  let onExceededCounter = 0
  const fastify = Fastify()
  await fastify.register(rateLimit, { global: false })

  fastify.get(
    '/',
    {
      config: Object.assign({}, defaultRouteConfig, {
        rateLimit: {
          max: 2,
          timeWindow: 1000,
          onExceeding: function (req) {
            // it will be executed 2 times
            assert.ok(req, 'req should be not null')
            onExceedingCounter += 1
          },
          onExceeded: function (req) {
            // it will be executed 2 times
            assert.ok(req, 'req should be not null')
            onExceededCounter += 1
          }
        }
      })
    },
    async (req, reply) => 'hello!'
  )

  const payload = { method: 'GET', url: '/' }

  let res

  res = await fastify.inject(payload)
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  res = await fastify.inject(payload)
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject(payload)
  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  assert.deepStrictEqual(onExceedingCounter, 2)
  assert.deepStrictEqual(onExceededCounter, 1)
})

tap.test('custom error response', async (t) => {
  t.plan(12)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    errorResponseBuilder: (req, context) => ({
      statusCode: 429,
      timeWindow: context.after,
      limit: context.max
    })
  })

  fastify.get(
    '/',
    {
      config: {
        rateLimit: {
          max: 2,
          timeWindow: 1000
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
  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  assert.deepStrictEqual(res.headers['retry-after'], '1')
  assert.deepStrictEqual(JSON.parse(res.payload), {
    statusCode: 429,
    timeWindow: '1 second',
    limit: 2
  })
})

tap.test('variable max contenders', async (t) => {
  t.plan(9)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    max: 1,
    timeWindow: 10000
  })

  fastify.get(
    '/',
    {
      config: {
        rateLimit: {
          keyGenerator: (req) => req.headers['api-key'],
          max: (req, key) => (key === 'pro' ? 3 : 2)
        }
      }
    },
    async (req, reply) => 'hello'
  )

  fastify.get(
    '/limit',
    { config: { rateLimit: {} } },
    async (req, res) => 'limited'
  )

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
    assert.deepStrictEqual(res.statusCode, item.status)
  }
})

// // TODO this test gets extremely flaky because of setTimeout
// // rewrite using https://www.npmjs.com/package/@sinonjs/fake-timers
tap.test('limit reset per Local storage', { skip: true }, async (t) => {
  t.plan(12)
  const fastify = Fastify()
  await fastify.register(rateLimit, { global: false })

  fastify.get(
    '/',
    {
      config: {
        rateLimit: {
          max: 1,
          timeWindow: 4000
        }
      }
    },
    (req, reply) => {
      reply.send('hello!')
    }
  )

  setTimeout(doRequest.bind(null, 4), 0)
  setTimeout(doRequest.bind(null, 3), 1000)
  setTimeout(doRequest.bind(null, 2), 2000)
  setTimeout(doRequest.bind(null, 1), 3000)
  setTimeout(doRequest.bind(null, 0), 4000)
  setTimeout(doRequest.bind(null, 4), 4100)

  function doRequest (resetValue) {
    fastify.inject('/', (err, res) => {
      t.error(err)
      assert.deepStrictEqual(res.headers['x-ratelimit-reset'], resetValue)
    })
  }
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

  fastify.get(
    '/',
    {
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
    },
    async (req, res) => 'hello'
  )

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
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
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
  assert.deepEqual(res.headers['x-ratelimit-reset'], '1')

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

  fastify.get(
    '/',
    {
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
    },
    async (req, res) => 'hello'
  )

  let res

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
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
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
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

  fastify.get(
    '/',
    {
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
    },
    async (req, res) => 'hello'
  )

  let res

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)
  assert.notStrictEqual(
    res.headers['x-ratelimit-limit'],
    'the header must be missing'
  )
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
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
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  assert.notStrictEqual(
    res.headers['x-ratelimit-reset'],
    'the header must be missing'
  )

  clock.reset()
})

tap.test('global timeWindow when not set in routes', async (t) => {
  t.plan(4)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    timeWindow: 6000
  })

  fastify.get(
    '/six',
    {
      config: { rateLimit: { max: 6 } }
    },
    async (req, res) => 'hello!'
  )

  fastify.get(
    '/four',
    {
      config: { rateLimit: { max: 4, timeWindow: 4000 } }
    },
    async (req, res) => 'hello!'
  )

  let res

  res = await fastify.inject('/six')
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '6')

  res = await fastify.inject('/four')
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '4')
})

tap.test('timeWindow specified as a string', async (t) => {
  t.plan(9)
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
    const store = new CustomStore(Object.assign(this.options, routeOptions))
    return store
  }

  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    store: CustomStore
  })

  fastify.get(
    '/',
    {
      config: { rateLimit: { max: 2, timeWindow: '10 seconds' } }
    },
    async (req, res) => 'hello!'
  )

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
    const store = new CustomStore(Object.assign(this.options, routeOptions))
    return store
  }

  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    max: 1,
    timeWindow: 10000,
    store: CustomStore
  })

  fastify.get(
    '/',
    {
      config: { rateLimit: { max: 2, timeWindow: 10000 } }
    },
    async (req, res) => 'hello!'
  )

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

tap.test('stops fastify lifecycle after onRequest and before preValidation', async (t) => {
  t.plan(4)
  const fastify = Fastify()
  await fastify.register(rateLimit, { global: false })

  let preValidationCallCount = 0

  fastify.get(
    '/',
    {
      config: {
        rateLimit: {
          max: 1,
          timeWindow: 1000
        }
      },
      preValidation: function (req, reply, next) {
        assert.ok('preValidation called only once')
        preValidationCallCount++
        next()
      }
    },
    async (req, res) => 'hello!'
  )

  let res

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(preValidationCallCount, 1)
})

tap.test('avoid double onRequest', async (t) => {
  t.plan(3)

  const fastify = Fastify()

  let keyGeneratorCallCount = 0

  const subroute = async (childServer) => {
    await childServer.register(rateLimit, {
      max: 1,
      timeWindow: 1000,
      keyGenerator: (req) => {
        assert.ok('keyGenerator called only once')
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
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(keyGeneratorCallCount, 1)
})

tap.test('Allow multiple different rate limiter registrations', async (t) => {
  t.plan(16)
  const fastify = Fastify()

  await fastify.register(rateLimit, {
    max: 1,
    timeWindow: 1000,
    whitelist: (req) => req.url !== '/test'
  })

  await fastify.register(rateLimit, {
    max: 1,
    timeWindow: 1000,
    whitelist: (req) => req.url === '/test'
  })

  fastify.get('/', async (req, reply) => 'hello!')

  fastify.get('/test', async (req, reply) => 'hello from another route!')

  let res

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  assert.deepStrictEqual(res.headers['retry-after'], '1')

  res = await fastify.inject('/test')
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject('/test')
  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  assert.deepStrictEqual(res.headers['retry-after'], '1')
})

tap.test('With enable IETF draft spec', async (t) => {
  t.plan(4)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    enableDraftSpec: true
  })

  fastify.get(
    '/',
    {
      config: defaultRouteConfig
    },
    async (req, res) => 'hello!'
  )

  const res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['ratelimit-remaining'], '1')
  assert.deepStrictEqual(res.headers['ratelimit-reset'], '1')
})

tap.test('per route rate limit', async (t) => {
  const fastify = Fastify({
    exposeHeadRoutes: true
  })
  await fastify.register(rateLimit, { global: false })

  fastify.get(
    '/',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: 1000
        }
      }
    },
    async (req, reply) => 'hello!'
  )

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
    'GET: x-ratelimit-limit header (per route limit)'
  )
  assert.deepStrictEqual(
    res.headers['x-ratelimit-remaining'],
    '9',
    'GET: x-ratelimit-remaining header (per route limit)'
  )

  assert.deepStrictEqual(
    resHead.statusCode,
    200,
    'HEAD: Response status code'
  )
  assert.deepStrictEqual(
    resHead.headers['x-ratelimit-limit'],
    '10',
    'HEAD: x-ratelimit-limit header (per route limit)'
  )
  assert.deepStrictEqual(
    resHead.headers['x-ratelimit-remaining'],
    '9',
    'HEAD: x-ratelimit-remaining header (per route limit)'
  )
})

tap.test('Allow custom timeWindow in preHandler', async (t) => {
  t.plan(23)
  const fastify = Fastify()
  await fastify.register(rateLimit, { global: false })
  fastify.register((fastify, options, done) => {
    fastify.get(
      '/default',
      {
        config: { rateLimit: { max: 1, timeWindow: '10 seconds' } }
      },
      async (req, reply) =>
        'Global rateLimiter should limit this with 60seconds timeWindow'
    )
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
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject('/2')
  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '120')
  assert.deepStrictEqual(res.headers['retry-after'], '120')

  res = await fastify.inject('/3')
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject('/3')
  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '180')
  assert.deepStrictEqual(res.headers['retry-after'], '180')

  res = await fastify.inject('/default')
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject('/default')
  assert.deepStrictEqual(res.headers['retry-after'], '10')
  assert.deepStrictEqual(res.statusCode, 429)
})

tap.test('When continue exceeding is on (Local)', async (t) => {
  const fastify = Fastify()

  await fastify.register(rateLimit, {
    global: false
  })

  fastify.get(
    '/',
    {
      config: {
        rateLimit: {
          max: 1,
          timeWindow: 5000,
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
})

tap.test('should consider routes allow list', async (t) => {
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false
  })

  fastify.get(
    '/',
    {
      config: {
        rateLimit: { allowList: ['127.0.0.1'], max: 2, timeWindow: 10000 }
      }
    },
    (req, reply) => {
      reply.send('hello!')
    }
  )

  let res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)
})

tap.test('on preValidation hook', async (t) => {
  const fastify = Fastify()

  await fastify.register(rateLimit, {
    global: false
  })

  fastify.get(
    '/quero',
    {
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
    },
    async (req, reply) => 'fastify is awesome !'
  )

  fastify.decorateRequest('userId', '')
  fastify.addHook('preParsing', async (req) => {
    const { userId } = req.query
    if (userId) {
      req.userId = userId
    }
  })

  const send = (userId) => {
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

  assert.deepStrictEqual(first.statusCode, 200)
  assert.deepStrictEqual(second.statusCode, 429)
  assert.deepStrictEqual(third.statusCode, 200)
  assert.deepStrictEqual(fourth.statusCode, 429)
  assert.deepStrictEqual(fifth.statusCode, 200)
})

tap.test('on undefined hook should use onRequest-hook', async (t) => {
  t.plan(2)
  const fastify = Fastify()

  await fastify.register(rateLimit, {
    global: false
  })

  fastify.addHook('onRoute', function (routeOptions) {
    assert.deepStrictEqual(routeOptions.preHandler, undefined)
    assert.deepStrictEqual(routeOptions.onRequest.length, 1)
  })

  fastify.get(
    '/',
    {
      exposeHeadRoute: false,
      config: {
        rateLimit: {
          max: 1,
          timeWindow: 10000,
          hook: 'onRequest'
        }
      }
    },
    async (req, reply) => 'fastify is awesome !'
  )
})

tap.test('on rateLimitHook should not be set twice on HEAD', async (t) => {
  const fastify = Fastify()

  await fastify.register(rateLimit, {
    global: false
  })

  fastify.addHook('onRoute', function (routeOptions) {
    assert.deepStrictEqual(routeOptions.preHandler, undefined)
    assert.deepStrictEqual(routeOptions.onRequest.length, 1)
  })

  fastify.get(
    '/',
    {
      exposeHeadRoute: true,
      config: {
        rateLimit: {
          max: 1,
          timeWindow: 10000,
          hook: 'onRequest'
        }
      }
    },
    async (req, reply) => 'fastify is awesome !'
  )

  fastify.head(
    '/explicit-head',
    {
      config: {
        rateLimit: {
          max: 1,
          timeWindow: 10000,
          hook: 'onRequest'
        }
      }
    },
    async (req, reply) => 'fastify is awesome !'
  )

  fastify.head(
    '/explicit-head-2',
    {
      exposeHeadRoute: true,
      config: {
        rateLimit: {
          max: 1,
          timeWindow: 10000,
          hook: 'onRequest'
        }
      }
    },
    async (req, reply) => 'fastify is awesome !'
  )
})

tap("child's allowList should not crash the app", async (t) => {
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    allowList: () => false
  })

  fastify.get(
    '/',
    {
      config: {
        rateLimit: { allowList: ['127.0.0.1'], max: 2, timeWindow: 10000 }
      }
    },
    (req, reply) => {
      reply.send('hello!')
    }
  )

  let res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)
})

tap("child's allowList function should not crash and should override parent", async (t) => {
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    allowList: ['127.0.0.1']
  })

  fastify.get(
    '/',
    {
      config: {
        rateLimit: { allowList: () => false, max: 2, timeWindow: 10000 }
      }
    },
    (req, reply) => {
      reply.send('hello!')
    }
  )

  let res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 429)
})

tap.test('rateLimit decorator should work when a property other than timeWindow is modified', async (t) => {
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    allowList: (req, key) => false
  })

  fastify.get(
    '/',
    {
      onRequest: fastify.rateLimit({
        allowList: ['127.0.0.1'],
        max: 1
      })
    },
    (req, reply) => {
      reply.send('hello!')
    }
  )

  let res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject({
    path: '/',
    remoteAddress: '1.1.1.1'
  })
  assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject({
    path: '/',
    remoteAddress: '1.1.1.1'
  })
  assert.deepStrictEqual(res.statusCode, 429)
})

tap.test('With NaN in subroute config', async (t) => {
  t.plan(12)
  const clock = mock.timers
  clock.enable(0)
  const fastify = Fastify()
  await fastify.register(rateLimit, { global: false })

  fastify.get(
    '/',
    {
      config: {
        rateLimit: {
          max: NaN
        }
      }
    },
    async (req, reply) => 'hello!'
  )

  let res

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1000')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '999')

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1000')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '998')

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1000')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '997')

  clock.tick(70000)

  res = await fastify.inject('/')
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1000')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '999')

  clock.reset()
})
