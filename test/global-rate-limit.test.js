'use strict'

const t = require('tap')
const test = t.test
const Redis = require('ioredis')
const Fastify = require('fastify')
const rateLimit = require('../index')
const noop = () => { }
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const REDIS_HOST = '127.0.0.1'

test('Basic', async t => {
  t.plan(15)
  const fastify = Fastify()
  fastify.register(rateLimit, { max: 2, timeWindow: 1000 })

  fastify.get('/', async (req, reply) => 'hello!')

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
  t.same({
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 1 second'
  }, JSON.parse(res.payload))

  // TODO - use sinom timers
  await sleep(1100)

  res = await fastify.inject('/')

  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 1)
})

test('With text timeWindow', async t => {
  t.plan(15)
  const fastify = Fastify()
  fastify.register(rateLimit, { max: 2, timeWindow: '1s' })

  fastify.get('/', async (req, reply) => 'hello!')

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
  t.same({
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 1 second'
  }, JSON.parse(res.payload))

  // TODO - use sinom timers
  await sleep(1100)

  res = await fastify.inject('/')

  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 1)
})

test('With ips allowList', async t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(rateLimit, {
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

test('With ips whitelist', async t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(rateLimit, {
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
  fastify.register(rateLimit, {
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

test('With redis store', async t => {
  t.plan(19)
  const fastify = Fastify()
  const redis = new Redis({ host: REDIS_HOST })
  fastify.register(rateLimit, {
    max: 2,
    timeWindow: 1000,
    redis: redis
  })

  fastify.get('/', async (req, reply) => 'hello!')

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
  t.equal(res.headers['x-ratelimit-reset'], 0)
  t.equal(res.headers['retry-after'], 1000)
  t.same({
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 1 second'
  }, JSON.parse(res.payload))

  // TODO - use sinom timers
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
    max: 2,
    timeWindow: 1000,
    redis,
    skipOnError: true
  })

  fastify.get('/', async (req, reply) => 'hello!')

  let res

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 1)

  redis.flushall(noop)
  await new Promise((resolve, reject) => redis.quit(err => err ? reject(err) : resolve()))

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 2)

  res = await fastify.inject('/')
  t.equal(res.statusCode, 200)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 2)
})

test('With keyGenerator', t => {
  t.plan(23)
  const fastify = Fastify()
  fastify.register(rateLimit, {
    max: 2,
    timeWindow: 1000,
    keyGenerator (req) {
      t.equal(req.headers['my-custom-header'], 'random-value')
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
    t.equal(res.statusCode, 200)
    t.equal(res.headers['x-ratelimit-limit'], 2)
    t.equal(res.headers['x-ratelimit-remaining'], 1)

    fastify.inject(payload, (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 200)
      t.equal(res.headers['x-ratelimit-limit'], 2)
      t.equal(res.headers['x-ratelimit-remaining'], 0)

      fastify.inject(payload, (err, res) => {
        t.error(err)
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

        setTimeout(retry, 1100)
      })
    })
  })

  function retry () {
    fastify.inject(payload, (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 200)
      t.equal(res.headers['x-ratelimit-limit'], 2)
      t.equal(res.headers['x-ratelimit-remaining'], 1)
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
    t.equal(res.statusCode, 200)
    t.equal(res.headers['x-ratelimit-limit'], 2)
    t.equal(res.headers['x-ratelimit-remaining'], 1)
    t.equal(res.headers['x-ratelimit-reset'], 9)

    fastify.inject('/', (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 200)
      t.equal(res.headers['x-ratelimit-limit'], 2)
      t.equal(res.headers['x-ratelimit-remaining'], 0)
      t.equal(res.headers['x-ratelimit-reset'], 8)

      fastify.inject('/', (err, res) => {
        t.error(err)
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
    t.equal(res.statusCode, 200)
    t.equal(res.headers['x-ratelimit-limit'], 2)
    t.equal(res.headers['x-ratelimit-remaining'], 1)
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
    t.equal(res.statusCode, 200)
    t.equal(res.headers['x-ratelimit-limit'], 2)
    t.equal(res.headers['x-ratelimit-remaining'], 1)
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
    t.equal(res.statusCode, 200)
    t.equal(res.headers['x-ratelimit-limit'], 50)
    t.equal(res.headers['x-ratelimit-remaining'], 49)
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
      t.equal(res.statusCode, item.status)
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
    t.equal(res.statusCode, 200)
    t.equal(res.headers['x-ratelimit-limit'], 1)
    t.equal(res.headers['x-ratelimit-remaining'], 0)
    t.equal(res.headers['x-ratelimit-reset'], 1)

    fastify.inject('/', (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 429)
      t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
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
      t.equal(res.statusCode, 200)
      t.equal(res.headers['x-ratelimit-limit'], 1)
      t.equal(res.headers['x-ratelimit-remaining'], 0)
      t.equal(res.headers['x-ratelimit-reset'], 1)
    })
  }
})

test('hide rate limit headers on exceeding', t => {
  t.plan(17)
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

  fastify.get('/', (req, res) => { res.send('hello') })

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.notOk(res.headers['x-ratelimit-limit'], 'the header must be missing')
    t.notOk(res.headers['x-ratelimit-remaining'], 'the header must be missing')
    t.notOk(res.headers['x-ratelimit-reset'], 'the header must be missing')

    fastify.inject('/', (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 429)
      t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
      t.equal(res.headers['x-ratelimit-limit'], 1)
      t.equal(res.headers['x-ratelimit-remaining'], 0)
      t.not(res.headers['x-ratelimit-reset'], undefined)
      t.equal(res.headers['retry-after'], 1000)

      setTimeout(retry, 1100)
    })
  })

  function retry () {
    fastify.inject('/', (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 200)
      t.notOk(res.headers['x-ratelimit-limit'], 'the header must be missing')
      t.notOk(res.headers['x-ratelimit-remaining'], 'the header must be missing')
      t.notOk(res.headers['x-ratelimit-reset'], 'the header must be missing')
    })
  }
})

test('hide rate limit headers at all times', t => {
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
    },
    addHeadersOnExceeding: {
      'x-ratelimit-limit': false,
      'x-ratelimit-remaining': false,
      'x-ratelimit-reset': false
    }
  })

  fastify.get('/', (req, res) => { res.send('hello') })

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.notOk(res.headers['x-ratelimit-limit'], 'the header must be missing')
    t.notOk(res.headers['x-ratelimit-remaining'], 'the header must be missing')
    t.notOk(res.headers['x-ratelimit-reset'], 'the header must be missing')

    fastify.inject('/', (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 429)
      t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
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
      t.equal(res.statusCode, 200)
      t.notOk(res.headers['x-ratelimit-limit'], 'the header must be missing')
      t.notOk(res.headers['x-ratelimit-remaining'], 'the header must be missing')
      t.notOk(res.headers['x-ratelimit-reset'], 'the header must be missing')
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
    t.equal(res.statusCode, 200)

    fastify.inject('/', (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 429)

      fastify.inject('/', (err, res) => {
        t.error(err)
        t.equal(res.statusCode, 403)
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
    t.equal(res.statusCode, 200)

    fastify.inject('/', (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 429)
      t.equal(preValidationCallCount, 1)
    })
  })
})

test('With enabled IETF Draft Spec', t => {
  t.plan(20)
  const fastify = Fastify()
  fastify.register(rateLimit, {
    max: 2,
    timeWindow: '1s',
    enableDraftSpec: true,
    errorResponseBuilder: function (req, context) {
      return {
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded, retry in 1 second',
        ttl: context.ttl
      }
    }
  })

  fastify.get('/', (req, reply) => {
    reply.send('hello!')
  })

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.equal(res.headers['ratelimit-limit'], 2)
    t.equal(res.headers['ratelimit-remaining'], 1)

    fastify.inject('/', (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 200)
      t.equal(res.headers['ratelimit-limit'], 2)
      t.equal(res.headers['ratelimit-remaining'], 0)

      fastify.inject('/', (err, res) => {
        t.error(err)
        t.equal(res.statusCode, 429)
        t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
        t.equal(res.headers['ratelimit-limit'], 2)
        t.equal(res.headers['ratelimit-remaining'], 0)
        t.equal(res.headers['ratelimit-remaining'], res.headers['retry-after'])
        const { ttl, ...payload } = JSON.parse(res.payload)
        t.equal(res.headers['retry-after'], Math.floor(ttl / 1000))
        t.same({
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'Rate limit exceeded, retry in 1 second'
        }, payload)

        setTimeout(retry, 1100)
      })
    })
  })

  function retry () {
    fastify.inject('/', (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 200)
      t.equal(res.headers['ratelimit-limit'], 2)
      t.equal(res.headers['ratelimit-remaining'], 1)
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
    t.equal(res.statusCode, 200)
    t.equal(res.headers['ratelimit-limit'], 1)
    t.equal(res.headers['ratelimit-remaining'], 0)
    t.equal(res.headers['ratelimit-reset'], 1)

    fastify.inject('/', (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 429)
      t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
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
      t.equal(res.statusCode, 200)
      t.equal(res.headers['ratelimit-limit'], 1)
      t.equal(res.headers['ratelimit-remaining'], 0)
      t.equal(res.headers['ratelimit-reset'], 1)
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
    t.equal(res.statusCode, 200)
    t.equal(res.headers['ratelimit-limit'], 1)
    t.equal(res.headers['ratelimit-remaining'], 0)

    setTimeout(retry.bind(null, 9), 500)
    setTimeout(retry.bind(null, 8), 1500)
  })

  function retry (timeLeft) {
    fastify.inject('/', (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 429)
      t.equal(res.headers['ratelimit-limit'], 1)
      t.equal(res.headers['ratelimit-remaining'], 0)
      t.equal(res.headers['ratelimit-reset'], timeLeft)
      t.equal(res.headers['ratelimit-reset'], res.headers['retry-after'])
    })
  }
})

test('Before async in "max"', async t => {
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    keyGenerator (req) { return req.headers['api-key'] },
    max: async (req, key) => { return requestSequence(key) },
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

  t.equal(res.statusCode, 200, 'GET: Response status code')
  t.equal(res.headers['x-ratelimit-limit'], 10, 'GET: x-ratelimit-limit header (global rate limit)')
  t.equal(res.headers['x-ratelimit-remaining'], 9, 'GET: x-ratelimit-remaining header (global rate limit)')

  t.equal(resHead.statusCode, 200, 'HEAD: Response status code')
  t.equal(resHead.headers['x-ratelimit-limit'], 10, 'HEAD: x-ratelimit-limit header (global rate limit)')
  t.equal(resHead.headers['x-ratelimit-remaining'], 8, 'HEAD: x-ratelimit-remaining header (global rate limit)')
})

test('When continue exceeding is on (Local)', async t => {
  const fastify = Fastify()

  fastify.register(rateLimit, {
    max: 1,
    timeWindow: 5000,
    continueExceeding: true
  })

  fastify.get('/', async (req, reply) => {
    return 'hello!'
  })

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

  const redis = new Redis({ host: REDIS_HOST })

  fastify.register(rateLimit, {
    redis: redis,
    max: 1,
    timeWindow: 5000,
    continueExceeding: true
  })

  fastify.get('/', async (req, reply) => {
    return 'hello!'
  })

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
