'use strict'

const t = require('tap')
const test = t.test
const Redis = require('ioredis')
const Fastify = require('fastify')
const rateLimit = require('../index')
const noop = () => {}

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

test('Basic', t => {
  t.plan(25)
  const fastify = Fastify()
  fastify.register(rateLimit, { global: false })

  fastify.get('/', {
    config: defaultRouteConfig
  }, (req, reply) => {
    reply.send('hello!')
  })

  fastify.setErrorHandler(function (error, request, reply) {
    t.pass('Error handler has been called')
    t.equals(reply.statusCode, 429)
    error.message += ' from error handler'
    reply.send(error)
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
        t.strictEqual(res.headers['retry-after'], 1000)
        t.strictEqual(res.headers['x-ratelimit-reset'], 0)
        t.deepEqual({
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'Rate limit exceeded, retry in 1 second from error handler'
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
      t.strictEqual(res.headers['x-ratelimit-reset'], 1)
    })
  }
})

test('With text timeWindow', t => {
  t.plan(19)
  const fastify = Fastify()
  fastify.register(rateLimit, { global: false })

  fastify.get('/', {
    config: defaultRouteConfig
  }, (req, reply) => {
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
        t.deepEqual(JSON.parse(res.payload), {
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'Rate limit exceeded, retry in 1 second'
        })

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
    global: false,
    allowList: ['127.0.0.1']
  })

  fastify.get('/', {
    config: defaultRouteConfig
  }, (req, reply) => {
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
    global: false,
    keyGenerator () { return 42 },
    allowList: function (req, key) {
      t.ok(req.headers)
      t.equals(key, 42)
      return req.headers['x-my-header'] !== undefined
    }
  })

  fastify.get('/', {
    config: defaultRouteConfig
  }, (req, reply) => {
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
    global: false,
    redis: redis
  })

  fastify.get('/', {
    config: defaultRouteConfig
  }, (req, reply) => {
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
        t.strictEqual(res.headers['retry-after'], 1000)
        t.strictEqual(res.headers['x-ratelimit-reset'], 0)
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
    redis: redis,
    global: false,
    skipError: false
  })

  fastify.get('/', {
    config: defaultRouteConfig
  }, (req, reply) => {
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
    global: false,
    keyGenerator (req) {
      t.strictEqual(req.headers['my-custom-header'], 'random-value')
      return req.headers['my-custom-header']
    }
  })

  fastify.get('/', {
    config: defaultRouteConfig
  }, (req, reply) => {
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

test('no rate limit without settings', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(rateLimit, { global: false })

  fastify.get('/', (req, reply) => {
    reply.send('hello!')
  })

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.headers['x-ratelimit-limit'], undefined)
    t.strictEqual(res.headers['x-ratelimit-remaining'], undefined)
  })
})

test('no rate limit with bad rate-limit parameters', t => {
  t.plan(1)
  const fastify = Fastify()
  fastify.register(rateLimit, { max: 2, timeWindow: 1000 })

  fastify.get('/', {
    config: Object.assign({}, defaultRouteConfig, { rateLimit: () => {} })
  }, (req, reply) => {
    reply.send('hello!')
  })

  fastify.ready((err) => {
    t.strictEqual(err.message, 'Unknown value for route rate-limit configuration')
  })
})

test('works with existing route config', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(rateLimit, { max: 2, timeWindow: 1000 })

  fastify.get('/', {
    config: defaultRouteConfig
  }, (req, reply) => {
    reply.send('hello!')
  })

  fastify.ready((err) => {
    t.error(err)
    fastify.inject('/', (err, res) => {
      t.error(err)
      t.strictEqual(res.headers['x-ratelimit-limit'], 2)
      t.strictEqual(res.headers['x-ratelimit-remaining'], 1)
    })
  })
})

test('With ban', t => {
  t.plan(6)
  const fastify = Fastify()
  fastify.register(rateLimit, {
    global: false
  })

  fastify.get('/', {
    config: { rateLimit: { max: 1, ban: 1 } }
  }, (req, reply) => {
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

test('route can disable the global limit', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(rateLimit, { max: 2, timeWindow: 1000 })

  fastify.get('/', {
    config: Object.assign({}, defaultRouteConfig, { rateLimit: false })
  }, (req, reply) => {
    reply.send('hello!')
  })

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.headers['x-ratelimit-limit'], undefined)
    t.strictEqual(res.headers['x-ratelimit-remaining'], undefined)
  })
})

test('does not override onRequest', t => {
  t.plan(5)
  const fastify = Fastify()
  fastify.register(rateLimit, { global: false })

  fastify.get('/', {
    onRequest: function (req, reply, next) {
      t.pass('onRequest called')
      next()
    },
    config: defaultRouteConfig
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

test('onExceeding and onExceeded events', t => {
  t.plan(14)

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
  }, (req, reply) => {
    reply.send('hello!')
  })

  const payload = { method: 'GET', url: '/' }

  fastify.inject(payload, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.headers['x-ratelimit-remaining'], 1)

    fastify.inject(payload, (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 200)
      t.strictEqual(res.headers['x-ratelimit-remaining'], 0)

      fastify.inject(payload, (err, res) => {
        t.error(err)
        t.strictEqual(res.statusCode, 429)
        t.strictEqual(res.headers['x-ratelimit-remaining'], 0)

        t.strictEqual(onExceedingCounter, 2)
        t.strictEqual(onExceededCounter, 1)
      })
    })
  })
})

test('custom error response', t => {
  t.plan(15)
  const fastify = Fastify()
  fastify.register(rateLimit, {
    global: false,
    errorResponseBuilder: function (req, context) {
      return { code: 429, timeWindow: context.after, limit: context.max }
    }
  })

  fastify.get('/', {
    config: {
      rateLimit: {
        max: 2,
        timeWindow: 1000
      }
    }
  }, (req, reply) => {
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
        t.deepEqual(JSON.parse(res.payload), {
          code: 429,
          timeWindow: '1 second',
          limit: 2
        })
      })
    })
  })
})

test('variable max contenders', t => {
  t.plan(18)
  const fastify = Fastify()
  fastify.register(rateLimit, {
    global: false,
    max: 1,
    timeWindow: 10000
  })

  fastify.get('/', {
    config: {
      rateLimit: {
        keyGenerator (req) { return req.headers['api-key'] },
        max: (req, key) => { return key === 'pro' ? 3 : 2 }
      }
    }
  }, (req, res) => { res.send('hello') })

  fastify.get('/limit', { config: { rateLimit: {} } }, (req, res) => { res.send('limited') })

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
      t.strictEqual(res.headers['x-ratelimit-reset'], resetValue)
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
  }, (req, res) => { res.send('hello') })

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
      t.strictEqual(res.headers['x-ratelimit-limit'], 1)
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

test('global timeWindow when not set in routes', t => {
  t.plan(6)
  const fastify = Fastify()
  fastify.register(rateLimit, {
    global: false,
    timeWindow: 6000
  })

  fastify.get('/six', {
    config: { rateLimit: { max: 6 } }
  }, (req, reply) => {
    reply.send('hello!')
  })

  fastify.get('/four', {
    config: { rateLimit: { max: 4, timeWindow: 4000 } }
  }, (req, reply) => {
    reply.send('hello!')
  })

  fastify.inject('/six', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.headers['x-ratelimit-reset'], 6)

    fastify.inject('/four', (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 200)
      t.strictEqual(res.headers['x-ratelimit-reset'], 4)
    })
  })
})

test('timeWindow specified as a string', t => {
  t.plan(12)
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
  }, (req, reply) => {
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
      })
    })
  })
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
  }, (req, reply) => {
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

test('stops fastify lifecycle after onRequest and before preValidation', t => {
  t.plan(6)
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

test('avoid double onRequest', t => {
  t.plan(4)

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

    childServer.get('/', {}, (req, reply) => {
      reply.send('hello!')
    })
  }

  fastify.register(subroute, { prefix: '/test' })

  fastify.inject({
    url: '/test',
    method: 'GET'
  }, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.equal(keyGeneratorCallCount, 1)
  })
})

test('Allow multiple different rate limiter registrations', t => {
  t.plan(20)
  const fastify = Fastify()

  fastify.register(rateLimit, {
    max: 1,
    timeWindow: 1000,
    whitelist: (req) => {
      return req.url !== '/test'
    }
  })

  fastify.register(rateLimit, {
    max: 1,
    timeWindow: 1000,
    whitelist: (req) => {
      return req.url === '/test'
    }
  })

  fastify.get('/', (req, reply) => {
    reply.send('hello!')
  })

  fastify.get('/test', (req, reply) => {
    reply.send('hello from another route!')
  })

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.headers['x-ratelimit-limit'], 1)
    t.strictEqual(res.headers['x-ratelimit-remaining'], 0)

    fastify.inject('/', (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 429)
      t.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8')
      t.strictEqual(res.headers['x-ratelimit-limit'], 1)
      t.strictEqual(res.headers['x-ratelimit-remaining'], 0)
      t.strictEqual(res.headers['retry-after'], 1000)
    })
  })

  fastify.inject('/test', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.headers['x-ratelimit-limit'], 1)
    t.strictEqual(res.headers['x-ratelimit-remaining'], 0)

    fastify.inject('/test', (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 429)
      t.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8')
      t.strictEqual(res.headers['x-ratelimit-limit'], 1)
      t.strictEqual(res.headers['x-ratelimit-remaining'], 0)
      t.strictEqual(res.headers['retry-after'], 1000)
    })
  })
})

test('With enable IETF draft spec', t => {
  t.plan(5)
  const fastify = Fastify()
  fastify.register(rateLimit, {
    global: false,
    enableDraftSpec: true
  })

  fastify.get('/', {
    config: defaultRouteConfig
  }, (req, reply) => {
    reply.send('hello!')
  })

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.headers['ratelimit-limit'], 2)
    t.strictEqual(res.headers['ratelimit-remaining'], 1)
    t.strictEqual(res.headers['ratelimit-reset'], 1)
  })
})
