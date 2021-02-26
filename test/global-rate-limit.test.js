'use strict'

const t = require('tap')
const test = t.test
const Redis = require('ioredis')
const Fastify = require('fastify')
const rateLimit = require('../index')
const noop = () => { }

const REDIS_HOST = '127.0.0.1'

test('Basic', t => {
  t.plan(19)
  const fastify = Fastify()
  fastify.register(rateLimit, { max: 2, timeWindow: 1000 })

  fastify.get('/', (req, reply) => {
    reply.send('hello!')
  })

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.headers['x-ratelimit-limit'], 2)
    t.strictEqual(res.headers['x-ratelimit-remaining'], 1)

    fastify.inject('/', (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 200)
      t.strictEqual(res.headers['x-ratelimit-limit'], 2)
      t.strictEqual(res.headers['x-ratelimit-remaining'], 0)

      fastify.inject('/', (err, res) => {
        t.error(err)
        t.strictEqual(res.statusCode, 429)
        t.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8')
        t.strictEqual(res.headers['x-ratelimit-limit'], 2)
        t.strictEqual(res.headers['x-ratelimit-remaining'], 0)
        t.strictEqual(res.headers['retry-after'], 1000)
        t.deepEqual({
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'Rate limit exceeded, retry in 1 second'
        }, JSON.parse(res.payload))

        setTimeout(retry, 1100)
      })
    })
  })

  function retry () {
    fastify.inject('/', (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 200)
      t.strictEqual(res.headers['x-ratelimit-limit'], 2)
      t.strictEqual(res.headers['x-ratelimit-remaining'], 1)
    })
  }
})

test('With text timeWindow', t => {
  t.plan(19)
  const fastify = Fastify()
  fastify.register(rateLimit, { max: 2, timeWindow: '1s' })

  fastify.get('/', (req, reply) => {
    reply.send('hello!')
  })

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.headers['x-ratelimit-limit'], 2)
    t.strictEqual(res.headers['x-ratelimit-remaining'], 1)

    fastify.inject('/', (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 200)
      t.strictEqual(res.headers['x-ratelimit-limit'], 2)
      t.strictEqual(res.headers['x-ratelimit-remaining'], 0)

      fastify.inject('/', (err, res) => {
        t.error(err)
        t.strictEqual(res.statusCode, 429)
        t.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8')
        t.strictEqual(res.headers['x-ratelimit-limit'], 2)
        t.strictEqual(res.headers['x-ratelimit-remaining'], 0)
        t.strictEqual(res.headers['retry-after'], 1000)
        t.deepEqual({
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'Rate limit exceeded, retry in 1 second'
        }, JSON.parse(res.payload))

        setTimeout(retry, 1100)
      })
    })
  })

  function retry () {
    fastify.inject('/', (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 200)
      t.strictEqual(res.headers['x-ratelimit-limit'], 2)
      t.strictEqual(res.headers['x-ratelimit-remaining'], 1)
    })
  }
})

test('With ips allowList', t => {
  t.plan(6)
  const fastify = Fastify()
  fastify.register(rateLimit, {
    max: 2,
    timeWindow: '2s',
    allowList: ['127.0.0.1']
  })

  fastify.get('/', (req, reply) => {
    reply.send('hello!')
  })

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)

    fastify.inject('/', (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 200)

      fastify.inject('/', (err, res) => {
        t.error(err)
        t.strictEqual(res.statusCode, 200)
      })
    })
  })
})

test('With ips whitelist', t => {
  t.plan(6)
  const fastify = Fastify()
  fastify.register(rateLimit, {
    max: 2,
    timeWindow: '2s',
    whitelist: ['127.0.0.1']
  })

  fastify.get('/', (req, reply) => {
    reply.send('hello!')
  })

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)

    fastify.inject('/', (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 200)

      fastify.inject('/', (err, res) => {
        t.error(err)
        t.strictEqual(res.statusCode, 200)
      })
    })
  })
})

test('With function allowList', t => {
  t.plan(24)
  const fastify = Fastify()
  fastify.register(rateLimit, {
    max: 2,
    timeWindow: '2s',
    keyGenerator () { return 42 },
    allowList: function (req, key) {
      t.ok(req.headers)
      t.equals(key, 42)
      return req.headers['x-my-header'] !== undefined
    }
  })

  fastify.get('/', (req, reply) => {
    reply.send('hello!')
  })

  const allowListHeader = {
    method: 'GET',
    url: '/',
    headers: {
      'x-my-header': 'FOO BAR'
    }
  }

  fastify.inject(allowListHeader, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)

    fastify.inject(allowListHeader, (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 200)

      fastify.inject(allowListHeader, (err, res) => {
        t.error(err)
        t.strictEqual(res.statusCode, 200)
      })
    })
  })

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)

    fastify.inject('/', (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 200)

      fastify.inject('/', (err, res) => {
        t.error(err)
        t.strictEqual(res.statusCode, 429)
      })
    })
  })
})

test('With redis store', t => {
  t.plan(23)
  const fastify = Fastify()
  const redis = new Redis({ host: REDIS_HOST })
  fastify.register(rateLimit, {
    max: 2,
    timeWindow: 1000,
    redis: redis
  })

  fastify.get('/', (req, reply) => {
    reply.send('hello!')
  })

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.headers['x-ratelimit-limit'], 2)
    t.strictEqual(res.headers['x-ratelimit-remaining'], 1)
    t.strictEqual(res.headers['x-ratelimit-reset'], 1)

    fastify.inject('/', (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 200)
      t.strictEqual(res.headers['x-ratelimit-limit'], 2)
      t.strictEqual(res.headers['x-ratelimit-remaining'], 0)
      t.strictEqual(res.headers['x-ratelimit-reset'], 0)

      fastify.inject('/', (err, res) => {
        t.error(err)
        t.strictEqual(res.statusCode, 429)
        t.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8')
        t.strictEqual(res.headers['x-ratelimit-limit'], 2)
        t.strictEqual(res.headers['x-ratelimit-remaining'], 0)
        t.strictEqual(res.headers['x-ratelimit-reset'], 0)
        t.strictEqual(res.headers['retry-after'], 1000)
        t.deepEqual({
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'Rate limit exceeded, retry in 1 second'
        }, JSON.parse(res.payload))

        setTimeout(retry, 1100)
      })
    })
  })

  function retry () {
    fastify.inject('/', (err, res) => {
      redis.flushall(noop)
      redis.quit(noop)
      t.error(err)
      t.strictEqual(res.statusCode, 200)
      t.strictEqual(res.headers['x-ratelimit-limit'], 2)
      t.strictEqual(res.headers['x-ratelimit-remaining'], 1)
      t.strictEqual(res.headers['x-ratelimit-reset'], 1)
    })
  }
})

test('Skip on redis error', t => {
  t.plan(13)
  const fastify = Fastify()
  const redis = new Redis({ host: REDIS_HOST })
  fastify.register(rateLimit, {
    max: 2,
    timeWindow: 1000,
    redis: redis,
    skipOnError: true
  })

  fastify.get('/', (req, reply) => {
    reply.send('hello!')
  })

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.headers['x-ratelimit-limit'], 2)
    t.strictEqual(res.headers['x-ratelimit-remaining'], 1)

    redis.flushall(noop)
    redis.quit(err => {
      t.error(err)

      fastify.inject('/', (err, res) => {
        t.error(err)
        t.strictEqual(res.statusCode, 200)
        t.strictEqual(res.headers['x-ratelimit-limit'], 2)
        t.strictEqual(res.headers['x-ratelimit-remaining'], 2)

        fastify.inject('/', (err, res) => {
          t.error(err)
          t.strictEqual(res.statusCode, 200)
          t.strictEqual(res.headers['x-ratelimit-limit'], 2)
          t.strictEqual(res.headers['x-ratelimit-remaining'], 2)
        })
      })
    })
  })
})

test('With keyGenerator', t => {
  t.plan(23)
  const fastify = Fastify()
  fastify.register(rateLimit, {
    max: 2,
    timeWindow: 1000,
    keyGenerator (req) {
      t.strictEqual(req.headers['my-custom-header'], 'random-value')
      return req.headers['my-custom-header']
    }
  })

  fastify.get('/', (req, reply) => {
    reply.send('hello!')
  })

  const payload = {
    method: 'GET',
    url: '/',
    headers: {
      'my-custom-header': 'random-value'
    }
  }

  fastify.inject(payload, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.headers['x-ratelimit-limit'], 2)
    t.strictEqual(res.headers['x-ratelimit-remaining'], 1)

    fastify.inject(payload, (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 200)
      t.strictEqual(res.headers['x-ratelimit-limit'], 2)
      t.strictEqual(res.headers['x-ratelimit-remaining'], 0)

      fastify.inject(payload, (err, res) => {
        t.error(err)
        t.strictEqual(res.statusCode, 429)
        t.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8')
        t.strictEqual(res.headers['x-ratelimit-limit'], 2)
        t.strictEqual(res.headers['x-ratelimit-remaining'], 0)
        t.strictEqual(res.headers['retry-after'], 1000)
        t.deepEqual({
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'Rate limit exceeded, retry in 1 second'
        }, JSON.parse(res.payload))

        setTimeout(retry, 1100)
      })
    })
  })

  function retry () {
    fastify.inject(payload, (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 200)
      t.strictEqual(res.headers['x-ratelimit-limit'], 2)
      t.strictEqual(res.headers['x-ratelimit-remaining'], 1)
    })
  }
})

test('With CustomStore', t => {
  t.plan(18)
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
  fastify.register(rateLimit, {
    max: 2,
    timeWindow: 10000,
    store: CustomStore
  })

  fastify.get('/', (req, reply) => {
    reply.send('hello!')
  })

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.headers['x-ratelimit-limit'], 2)
    t.strictEqual(res.headers['x-ratelimit-remaining'], 1)
    t.strictEqual(res.headers['x-ratelimit-reset'], 9)

    fastify.inject('/', (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 200)
      t.strictEqual(res.headers['x-ratelimit-limit'], 2)
      t.strictEqual(res.headers['x-ratelimit-remaining'], 0)
      t.strictEqual(res.headers['x-ratelimit-reset'], 8)

      fastify.inject('/', (err, res) => {
        t.error(err)
        t.strictEqual(res.statusCode, 429)
        t.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8')
        t.strictEqual(res.headers['x-ratelimit-limit'], 2)
        t.strictEqual(res.headers['x-ratelimit-remaining'], 0)
        t.strictEqual(res.headers['x-ratelimit-reset'], 7)
        t.strictEqual(res.headers['retry-after'], 10000)
        t.deepEqual({
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'Rate limit exceeded, retry in 10 seconds'
        }, JSON.parse(res.payload))
      })
    })
  })
})

test('does not override the onRequest', t => {
  t.plan(5)
  const fastify = Fastify()
  fastify.register(rateLimit, {
    max: 2,
    timeWindow: 1000
  })

  fastify.get('/', {
    onRequest: function (req, reply, next) {
      t.pass('onRequest called')
      next()
    }
  }, (req, reply) => {
    reply.send('hello!')
  })

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.headers['x-ratelimit-limit'], 2)
    t.strictEqual(res.headers['x-ratelimit-remaining'], 1)
  })
})

test('does not override the onRequest as an array', t => {
  t.plan(5)
  const fastify = Fastify()
  fastify.register(rateLimit, {
    max: 2,
    timeWindow: 1000
  })

  fastify.get('/', {
    onRequest: [function (req, reply, next) {
      t.pass('onRequest called')
      next()
    }]
  }, (req, reply) => {
    reply.send('hello!')
  })

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.headers['x-ratelimit-limit'], 2)
    t.strictEqual(res.headers['x-ratelimit-remaining'], 1)
  })
})

test('variable max', t => {
  t.plan(5)
  const fastify = Fastify()
  fastify.register(rateLimit, {
    max: (req, key) => {
      t.pass()
      return +req.headers['secret-max']
    },
    timeWindow: 1000
  })

  fastify.get('/', (req, res) => { res.send('hello') })

  fastify.inject({ url: '/', headers: { 'secret-max': 50 } }, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.headers['x-ratelimit-limit'], 50)
    t.strictEqual(res.headers['x-ratelimit-remaining'], 49)
  })
})

test('variable max contenders', t => {
  t.plan(14)
  const fastify = Fastify()
  fastify.register(rateLimit, {
    keyGenerator (req) { return req.headers['api-key'] },
    max: (req, key) => { return key === 'pro' ? 3 : 2 },
    timeWindow: 10000
  })

  fastify.get('/', (req, res) => { res.send('hello') })

  const requestSequence = [
    { headers: { 'api-key': 'pro' }, status: 200, url: '/' },
    { headers: { 'api-key': 'pro' }, status: 200, url: '/' },
    { headers: { 'api-key': 'pro' }, status: 200, url: '/' },
    { headers: { 'api-key': 'pro' }, status: 429, url: '/' },
    { headers: { 'api-key': 'NOT' }, status: 200, url: '/' },
    { headers: { 'api-key': 'NOT' }, status: 200, url: '/' },
    { headers: { 'api-key': 'NOT' }, status: 429, url: '/' }
  ]

  next()

  function next () {
    const item = requestSequence.shift()
    if (!item) {
      return
    }
    fastify.inject({ url: item.url, headers: item.headers }, (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, item.status)
      next()
    })
  }
})

test('hide rate limit headers', t => {
  t.plan(17)
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

  fastify.get('/', (req, res) => { res.send('hello') })

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.headers['x-ratelimit-limit'], 1)
    t.strictEqual(res.headers['x-ratelimit-remaining'], 0)
    t.strictEqual(res.headers['x-ratelimit-reset'], 1)

    fastify.inject('/', (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 429)
      t.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8')
      t.notOk(res.headers['x-ratelimit-limit'], 'the header must be missing')
      t.notOk(res.headers['x-ratelimit-remaining'], 'the header must be missing')
      t.notOk(res.headers['x-ratelimit-reset'], 'the header must be missing')
      t.notOk(res.headers['retry-after'], 'the header must be missing')

      setTimeout(retry, 1100)
    })
  })

  function retry () {
    fastify.inject('/', (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 200)
      t.strictEqual(res.headers['x-ratelimit-limit'], 1)
      t.strictEqual(res.headers['x-ratelimit-remaining'], 0)
      t.strictEqual(res.headers['x-ratelimit-reset'], 1)
    })
  }
})

test('With ban', t => {
  t.plan(6)
  const fastify = Fastify()
  fastify.register(rateLimit, {
    max: 1,
    ban: 1
  })

  fastify.get('/', (req, reply) => {
    reply.send('hello!')
  })

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)

    fastify.inject('/', (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 429)

      fastify.inject('/', (err, res) => {
        t.error(err)
        t.strictEqual(res.statusCode, 403)
      })
    })
  })
})

test('stops fastify lifecycle after onRequest and before preValidation', t => {
  t.plan(6)
  const fastify = Fastify()
  fastify.register(rateLimit, { max: 1, timeWindow: 1000 })

  let preValidationCallCount = 0

  fastify.get('/', {
    preValidation: function (req, reply, next) {
      t.pass('preValidation called only once')
      preValidationCallCount++
      next()
    }
  },
  (req, reply) => {
    reply.send('hello!')
  })

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)

    fastify.inject('/', (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 429)
      t.equal(preValidationCallCount, 1)
    })
  })
})

test('With enabled IETF Draft Spec', t => {
  t.plan(19)
  const fastify = Fastify()
  fastify.register(rateLimit, {
    max: 2,
    timeWindow: '1s',
    enableDraftSpec: true
  })

  fastify.get('/', (req, reply) => {
    reply.send('hello!')
  })

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.headers['ratelimit-limit'], 2)
    t.strictEqual(res.headers['ratelimit-remaining'], 1)

    fastify.inject('/', (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 200)
      t.strictEqual(res.headers['ratelimit-limit'], 2)
      t.strictEqual(res.headers['ratelimit-remaining'], 0)

      fastify.inject('/', (err, res) => {
        t.error(err)
        t.strictEqual(res.statusCode, 429)
        t.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8')
        t.strictEqual(res.headers['ratelimit-limit'], 2)
        t.strictEqual(res.headers['ratelimit-remaining'], 0)
        t.strictEqual(res.headers['ratelimit-remaining'], res.headers['retry-after'])
        t.deepEqual({
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'Rate limit exceeded, retry in 1 second'
        }, JSON.parse(res.payload))

        setTimeout(retry, 1100)
      })
    })
  })

  function retry () {
    fastify.inject('/', (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 200)
      t.strictEqual(res.headers['ratelimit-limit'], 2)
      t.strictEqual(res.headers['ratelimit-remaining'], 1)
    })
  }
})

test('hide IETF draft spec headers', t => {
  t.plan(17)
  const fastify = Fastify()
  fastify.register(rateLimit, {
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

  fastify.get('/', (req, res) => { res.send('hello') })

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.headers['ratelimit-limit'], 1)
    t.strictEqual(res.headers['ratelimit-remaining'], 0)
    t.strictEqual(res.headers['ratelimit-reset'], 1)

    fastify.inject('/', (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 429)
      t.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8')
      t.notOk(res.headers['ratelimit-limit'], 'the header must be missing')
      t.notOk(res.headers['ratelimit-remaining'], 'the header must be missing')
      t.notOk(res.headers['ratelimit-reset'], 'the header must be missing')
      t.notOk(res.headers['retry-after'], 'the header must be missing')

      setTimeout(retry, 1100)
    })
  })

  function retry () {
    fastify.inject('/', (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 200)
      t.strictEqual(res.headers['ratelimit-limit'], 1)
      t.strictEqual(res.headers['ratelimit-remaining'], 0)
      t.strictEqual(res.headers['ratelimit-reset'], 1)
    })
  }
})

test('afterReset and Rate Limit remain the same when enableDraftSpec is enabled', t => {
  t.plan(16)
  const fastify = Fastify()
  fastify.register(rateLimit, {
    max: 1,
    timeWindow: '10s',
    enableDraftSpec: true
  })

  fastify.get('/', (req, reply) => {
    reply.send('hello!')
  })

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.headers['ratelimit-limit'], 1)
    t.strictEqual(res.headers['ratelimit-remaining'], 0)

    setTimeout(retry.bind(null, 9), 500)
    setTimeout(retry.bind(null, 8), 1500)
  })

  function retry (timeLeft) {
    fastify.inject('/', (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 429)
      t.strictEqual(res.headers['ratelimit-limit'], 1)
      t.strictEqual(res.headers['ratelimit-remaining'], 0)
      t.strictEqual(res.headers['ratelimit-reset'], timeLeft)
      t.strictEqual(res.headers['ratelimit-reset'], res.headers['retry-after'])
    })
  }
})

test('Before async in "max"', async t => {
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    keyGenerator (req) { return req.headers['api-key'] },
    max: async (req, key) => { return await requestSequence(key) },
    timeWindow: 10000
  })

  await fastify.get('/', (req, res) => { res.send('hello') })

  const requestSequence = async (key) => await key === 'pro' ? 5 : 2
})

test('exposeHeadRoutes', async t => {
  const fastify = Fastify({
    exposeHeadRoutes: true
  })
  fastify.register(rateLimit, {
    max: 10,
    timeWindow: 1000
  })
  fastify.get('/', async (req, reply) => {
    return 'hello!'
  })

  const res = await fastify.inject({
    url: '/',
    method: 'GET'
  })

  const resHead = await fastify.inject({
    url: '/',
    method: 'HEAD'
  })

  t.strictEqual(res.statusCode, 200, 'GET: Response status code')
  t.strictEqual(res.headers['x-ratelimit-limit'], 10, 'GET: x-ratelimit-limit header (global rate limit)')
  t.strictEqual(res.headers['x-ratelimit-remaining'], 9, 'GET: x-ratelimit-remaining header (global rate limit)')

  t.strictEqual(resHead.statusCode, 200, 'HEAD: Response status code')
  t.strictEqual(resHead.headers['x-ratelimit-limit'], 10, 'HEAD: x-ratelimit-limit header (global rate limit)')
  t.strictEqual(resHead.headers['x-ratelimit-remaining'], 8, 'HEAD: x-ratelimit-remaining header (global rate limit)')
})
