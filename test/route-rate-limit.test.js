'use strict'

const { test, mock } = require('node:test')
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

test('Basic', async (t) => {
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
    async () => 'hello!'
  )

  fastify.setErrorHandler(function (error, _request, reply) {
    // t.assert.ok('Error handler has been called')
    t.assert.deepStrictEqual(error.statusCode, 429)
    reply.code(429)
    error.message += ' from error handler'
    reply.send(error)
  })

  let res

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

  // Ticking time to simulate time been passed, passing `shouldAdvanceTime: true` won't help as between the 2 requests
  // the event loop not reached the timer stage and is not able to run the `setInterval` that sinonjs/fake-timers use internally to update the time
  clock.tick(1)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

  clock.tick(500)

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
      message: 'Rate limit exceeded, retry in 1 second from error handler'
    },
    JSON.parse(res.payload)
  )

  clock.tick(1100)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

  clock.reset()
})

test('With text timeWindow', async (t) => {
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
    async () => 'hello!'
  )

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
  t.assert.deepStrictEqual(JSON.parse(res.payload), {
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 1 second'
  })

  clock.tick(1100)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  clock.reset()
})

test('With function timeWindow', async (t) => {
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
    async () => 'hello!'
  )

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
  t.assert.deepStrictEqual(JSON.parse(res.payload), {
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 1 second'
  })

  clock.tick(1100)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  clock.reset()
})

test('With ips allowList', async (t) => {
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
    async () => 'hello!'
  )

  let res

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
})

test('With function allowList', async (t) => {
  t.plan(18)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    keyGenerator: () => 42,
    allowList: (req, key) => {
      t.assert.ok(req.headers)
      t.assert.deepStrictEqual(key, 42)
      return req.headers['x-my-header'] !== undefined
    }
  })

  fastify.get(
    '/',
    {
      config: defaultRouteConfig
    },
    async () => 'hello!'
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
  t.assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject(allowListHeader)
  t.assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject(allowListHeader)
  t.assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 429)
})

test('With onExceeding option', async (t) => {
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
          onExceeding: function () {
            t.assert.ok('onExceeding called')
          }
        }
      }
    },
    async () => 'hello!'
  )

  let res

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 429)
})

test('With onExceeded option', async (t) => {
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
          onExceeded: function () {
            t.assert.ok('onExceeded called')
          }
        }
      }
    },
    async () => 'hello!'
  )

  let res

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 429)
})

test('With keyGenerator', async (t) => {
  t.plan(19)
  const clock = mock.timers
  clock.enable(0)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    keyGenerator: (req) => {
      t.assert.deepStrictEqual(req.headers['my-custom-header'], 'random-value')
      return req.headers['my-custom-header']
    }
  })

  fastify.get(
    '/',
    {
      config: defaultRouteConfig
    },
    async () => 'hello!'
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
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  res = await fastify.inject(payload)
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject(payload)
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

  res = await fastify.inject(payload)
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  clock.reset()
})

test('no rate limit without settings', async (t) => {
  t.plan(3)
  const fastify = Fastify()
  await fastify.register(rateLimit, { global: false })

  fastify.get('/', async () => 'hello!')

  const res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], undefined)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], undefined)
})

test('no rate limit with bad rate-limit parameters', async (t) => {
  t.plan(1)
  const fastify = Fastify()
  await fastify.register(rateLimit, { max: 2, timeWindow: 1000 })

  try {
    fastify.get(
      '/',
      {
        config: Object.assign({}, defaultRouteConfig, { rateLimit: () => {} })
      },
      async () => 'hello!'
    )

    t.fail('should throw')
  } catch (err) {
    t.assert.deepStrictEqual(
      err.message,
      'Unknown value for route rate-limit configuration'
    )
  }
})

test('works with existing route config', async (t) => {
  t.plan(2)
  const fastify = Fastify()
  await fastify.register(rateLimit, { max: 2, timeWindow: 1000 })

  fastify.get(
    '/',
    {
      config: defaultRouteConfig
    },
    async () => 'hello!'
  )

  await fastify.ready()
  const res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
})

test('With ban', async (t) => {
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
    async () => 'hello!'
  )

  let res

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 429)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 403)
})

test('route can disable the global limit', async (t) => {
  t.plan(3)
  const fastify = Fastify()
  await fastify.register(rateLimit, { max: 2, timeWindow: 1000 })

  fastify.get(
    '/',
    {
      config: Object.assign({}, defaultRouteConfig, { rateLimit: false })
    },
    async () => 'hello!'
  )

  const res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], undefined)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], undefined)
})

test('does not override onRequest', async (t) => {
  t.plan(4)
  const fastify = Fastify()
  await fastify.register(rateLimit, { global: false })

  fastify.get(
    '/',
    {
      onRequest: function (_req, _reply, next) {
        t.assert.ok('onRequest called')
        next()
      },
      config: defaultRouteConfig
    },
    async () => 'hello!'
  )

  const res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
})

test('onExceeding and onExceeded events', async (t) => {
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
            t.assert.ok(req, 'req should be not null')
            onExceedingCounter += 1
          },
          onExceeded: function (req) {
            // it will be executed 2 times
            t.assert.ok(req, 'req should be not null')
            onExceededCounter += 1
          }
        }
      })
    },
    async () => 'hello!'
  )

  const payload = { method: 'GET', url: '/' }

  let res

  res = await fastify.inject(payload)
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  res = await fastify.inject(payload)
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject(payload)
  t.assert.deepStrictEqual(res.statusCode, 429)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  t.assert.deepStrictEqual(onExceedingCounter, 2)
  t.assert.deepStrictEqual(onExceededCounter, 1)
})

test('custom error response', async (t) => {
  t.plan(12)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_req, context) => ({
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
    async () => 'hello!'
  )

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
  t.assert.deepStrictEqual(JSON.parse(res.payload), {
    statusCode: 429,
    timeWindow: '1 second',
    limit: 2
  })
})

test('variable max contenders', async (t) => {
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
          max: (_req, key) => (key === 'pro' ? 3 : 2)
        }
      }
    },
    async () => 'hello'
  )

  fastify.get(
    '/limit',
    { config: { rateLimit: {} } },
    async () => 'limited'
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
    t.assert.deepStrictEqual(res.statusCode, item.status)
  }
})

// // TODO this test gets extremely flaky because of setTimeout
// // rewrite using https://www.npmjs.com/package/@sinonjs/fake-timers
test('limit reset per Local storage', { skip: true }, async (t) => {
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
    (_req, reply) => {
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
      t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], resetValue)
    })
  }
})

test('hide rate limit headers', async (t) => {
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
    async () => 'hello'
  )

  let res

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 429)
  t.assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  t.assert.notStrictEqual(
    res.headers['x-ratelimit-remaining'],
    'the header must be missing'
  )
  t.assert.notStrictEqual(
    res.headers['x-ratelimit-reset'],
    'the header must be missing'
  )
  t.assert.notStrictEqual(
    res.headers['retry-after'],
    'the header must be missing'
  )

  clock.tick(1100)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepEqual(res.headers['x-ratelimit-reset'], '1')

  clock.reset()
})

test('hide rate limit headers on exceeding', async (t) => {
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
    async () => 'hello'
  )

  let res

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  t.assert.notStrictEqual(
    res.headers['x-ratelimit-remaining'],
    'the header must be missing'
  )
  t.assert.notStrictEqual(
    res.headers['x-ratelimit-reset'],
    'the header must be missing'
  )

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 429)
  t.assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.notStrictEqual(res.headers['x-ratelimit-reset'], undefined)
  t.assert.deepStrictEqual(res.headers['retry-after'], '1')

  clock.tick(1100)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  t.assert.notStrictEqual(
    res.headers['x-ratelimit-remaining'],
    'the header must be missing'
  )
  t.assert.notStrictEqual(
    res.headers['x-ratelimit-reset'],
    'the header must be missing'
  )

  clock.reset()
})

test('hide rate limit headers at all times', async (t) => {
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
    async () => 'hello'
  )

  let res

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.notStrictEqual(
    res.headers['x-ratelimit-limit'],
    'the header must be missing'
  )
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.notStrictEqual(
    res.headers['x-ratelimit-reset'],
    'the header must be missing'
  )

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 429)
  t.assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  t.assert.notStrictEqual(
    res.headers['x-ratelimit-remaining'],
    'the header must be missing'
  )
  t.assert.notStrictEqual(
    res.headers['x-ratelimit-reset'],
    'the header must be missing'
  )
  t.assert.notStrictEqual(
    res.headers['retry-after'],
    'the header must be missing'
  )

  clock.tick(1100)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.notStrictEqual(
    res.headers['x-ratelimit-limit'],
    'the header must be missing'
  )
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.notStrictEqual(
    res.headers['x-ratelimit-reset'],
    'the header must be missing'
  )

  clock.reset()
})

test('global timeWindow when not set in routes', async (t) => {
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
    async () => 'hello!'
  )

  fastify.get(
    '/four',
    {
      config: { rateLimit: { max: 4, timeWindow: 4000 } }
    },
    async () => 'hello!'
  )

  let res

  res = await fastify.inject('/six')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '6')

  res = await fastify.inject('/four')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '4')
})

test('timeWindow specified as a string', async (t) => {
  t.plan(9)
  function CustomStore (options) {
    this.options = options
    this.current = 0
  }

  CustomStore.prototype.incr = function (_key, cb) {
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
    async () => 'hello!'
  )

  let res

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '9')

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '8')

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 429)
})

test('With CustomStore', async (t) => {
  t.plan(15)
  function CustomStore (options) {
    this.options = options
    this.current = 0
  }

  CustomStore.prototype.incr = function (_key, cb) {
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
    async () => 'hello!'
  )

  let res

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '9')

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '8')

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 429)
  t.assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '7')
  t.assert.deepStrictEqual(res.headers['retry-after'], '7')
  t.assert.deepStrictEqual(
    {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry in 7 seconds'
    },
    JSON.parse(res.payload)
  )
})

test('stops fastify lifecycle after onRequest and before preValidation', async (t) => {
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
      preValidation: function (_req, _reply, next) {
        t.assert.ok('preValidation called only once')
        preValidationCallCount++
        next()
      }
    },
    async () => 'hello!'
  )

  let res

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 429)
  t.assert.deepStrictEqual(preValidationCallCount, 1)
})

test('avoid double onRequest', async (t) => {
  t.plan(3)

  const fastify = Fastify()

  let keyGeneratorCallCount = 0

  const subroute = async (childServer) => {
    await childServer.register(rateLimit, {
      max: 1,
      timeWindow: 1000,
      keyGenerator: (req) => {
        t.assert.ok('keyGenerator called only once')
        keyGeneratorCallCount++

        return req.ip
      }
    })

    childServer.get('/', {}, async () => 'hello!')
  }

  fastify.register(subroute, { prefix: '/test' })

  const res = await fastify.inject({
    url: '/test',
    method: 'GET'
  })
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(keyGeneratorCallCount, 1)
})

test('Allow multiple different rate limiter registrations', async (t) => {
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

  fastify.get('/', async () => 'hello!')

  fastify.get('/test', async () => 'hello from another route!')

  let res

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 429)
  t.assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['retry-after'], '1')

  res = await fastify.inject('/test')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject('/test')
  t.assert.deepStrictEqual(res.statusCode, 429)
  t.assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['retry-after'], '1')
})

test('With enable IETF draft spec', async (t) => {
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
    async () => 'hello!'
  )

  const res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['ratelimit-remaining'], '1')
  t.assert.deepStrictEqual(res.headers['ratelimit-reset'], '1')
})

test('per route rate limit', async (t) => {
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
    async () => 'hello!'
  )

  const res = await fastify.inject({
    url: '/',
    method: 'GET'
  })

  const resHead = await fastify.inject({
    url: '/',
    method: 'HEAD'
  })

  t.assert.deepStrictEqual(res.statusCode, 200, 'GET: Response status code')
  t.assert.deepStrictEqual(
    res.headers['x-ratelimit-limit'],
    '10',
    'GET: x-ratelimit-limit header (per route limit)'
  )
  t.assert.deepStrictEqual(
    res.headers['x-ratelimit-remaining'],
    '9',
    'GET: x-ratelimit-remaining header (per route limit)'
  )

  t.assert.deepStrictEqual(
    resHead.statusCode,
    200,
    'HEAD: Response status code'
  )
  t.assert.deepStrictEqual(
    resHead.headers['x-ratelimit-limit'],
    '10',
    'HEAD: x-ratelimit-limit header (per route limit)'
  )
  t.assert.deepStrictEqual(
    resHead.headers['x-ratelimit-remaining'],
    '9',
    'HEAD: x-ratelimit-remaining header (per route limit)'
  )
})

test('Allow custom timeWindow in preHandler', async (t) => {
  t.plan(23)
  const fastify = Fastify()
  await fastify.register(rateLimit, { global: false })
  fastify.register((fastify, _options, done) => {
    fastify.get(
      '/default',
      {
        config: { rateLimit: { max: 1, timeWindow: '10 seconds' } }
      },
      async () =>
        'Global rateLimiter should limit this with 60seconds timeWindow'
    )
    fastify.route({
      method: 'GET',
      url: '/2',
      preHandler: [
        fastify.rateLimit({
          max: 1,
          timeWindow: '2 minutes',
          keyGenerator: () => 245
        })
      ],

      handler: async () => ({ hello: 'world' })
    })

    fastify.route({
      method: 'GET',
      url: '/3',
      preHandler: [
        fastify.rateLimit({
          max: 1,
          timeWindow: '3 minutes',
          keyGenerator: () => 345
        })
      ],

      handler: async () => ({ hello: 'world' })
    })

    done()
  })

  let res = await fastify.inject('/2')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject('/2')
  t.assert.deepStrictEqual(res.statusCode, 429)
  t.assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '120')
  t.assert.deepStrictEqual(res.headers['retry-after'], '120')

  res = await fastify.inject('/3')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject('/3')
  t.assert.deepStrictEqual(res.statusCode, 429)
  t.assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '180')
  t.assert.deepStrictEqual(res.headers['retry-after'], '180')

  res = await fastify.inject('/default')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject('/default')
  t.assert.deepStrictEqual(res.headers['retry-after'], '10')
  t.assert.deepStrictEqual(res.statusCode, 429)
})

test('When continue exceeding is on (Local)', async (t) => {
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
})

test('should consider routes allow list', async (t) => {
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
    (_req, reply) => {
      reply.send('hello!')
    }
  )

  let res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
})

test('on preValidation hook', async (t) => {
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
    async () => 'fastify is awesome !'
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

  t.assert.deepStrictEqual(first.statusCode, 200)
  t.assert.deepStrictEqual(second.statusCode, 429)
  t.assert.deepStrictEqual(third.statusCode, 200)
  t.assert.deepStrictEqual(fourth.statusCode, 429)
  t.assert.deepStrictEqual(fifth.statusCode, 200)
})

test('on undefined hook should use onRequest-hook', async (t) => {
  t.plan(2)
  const fastify = Fastify()

  await fastify.register(rateLimit, {
    global: false
  })

  fastify.addHook('onRoute', function (routeOptions) {
    t.assert.deepStrictEqual(routeOptions.preHandler, undefined)
    t.assert.deepStrictEqual(routeOptions.onRequest.length, 1)
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
    async () => 'fastify is awesome !'
  )
})

test('on rateLimitHook should not be set twice on HEAD', async (t) => {
  const fastify = Fastify()

  await fastify.register(rateLimit, {
    global: false
  })

  fastify.addHook('onRoute', function (routeOptions) {
    t.assert.deepStrictEqual(routeOptions.preHandler, undefined)
    t.assert.deepStrictEqual(routeOptions.onRequest.length, 1)
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
    async () => 'fastify is awesome !'
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
    async () => 'fastify is awesome !'
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
    async () => 'fastify is awesome !'
  )
})

test("child's allowList should not crash the app", async (t) => {
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
    (_req, reply) => {
      reply.send('hello!')
    }
  )

  let res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
})

test("child's allowList function should not crash and should override parent", async (t) => {
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
    (_req, reply) => {
      reply.send('hello!')
    }
  )

  let res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 429)
})

test('rateLimit decorator should work when a property other than timeWindow is modified', async (t) => {
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    allowList: () => false
  })

  fastify.get(
    '/',
    {
      onRequest: fastify.rateLimit({
        allowList: ['127.0.0.1'],
        max: 1
      })
    },
    (_req, reply) => {
      reply.send('hello!')
    }
  )

  let res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject({
    path: '/',
    remoteAddress: '1.1.1.1'
  })
  t.assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject({
    path: '/',
    remoteAddress: '1.1.1.1'
  })
  t.assert.deepStrictEqual(res.statusCode, 429)
})

test('With NaN in subroute config', async (t) => {
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
    async () => 'hello!'
  )

  let res

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1000')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '999')

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1000')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '998')

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1000')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '997')

  clock.tick(70000)

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '1000')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '999')

  clock.reset()
})
