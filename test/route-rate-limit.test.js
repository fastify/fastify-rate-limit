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
        t.strictEqual(res.headers['content-type'], 'application/json')
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
        t.strictEqual(res.headers['content-type'], 'application/json')
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

test('With ips whitelist', t => {
  t.plan(6)
  const fastify = Fastify()
  fastify.register(rateLimit, {
    global: false,
    whitelist: ['127.0.0.1']
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

test('With redis store', t => {
  t.plan(19)
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

    fastify.inject('/', (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 200)
      t.strictEqual(res.headers['x-ratelimit-limit'], 2)
      t.strictEqual(res.headers['x-ratelimit-remaining'], 0)

      fastify.inject('/', (err, res) => {
        t.error(err)
        t.strictEqual(res.statusCode, 429)
        t.strictEqual(res.headers['content-type'], 'application/json')
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
      redis.flushall(noop)
      redis.quit(noop)
      t.error(err)
      t.strictEqual(res.statusCode, 200)
      t.strictEqual(res.headers['x-ratelimit-limit'], 2)
      t.strictEqual(res.headers['x-ratelimit-remaining'], 1)
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
        t.strictEqual(res.headers['content-type'], 'application/json')
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
  t.plan(3)
  const fastify = Fastify()
  fastify.register(rateLimit, { max: 2, timeWindow: 1000 })

  fastify.get('/', {
    config: defaultRouteConfig
  }, (req, reply) => {
    reply.send('hello!')
  })

  fastify.ready((err) => {
    t.strictEqual(err, null)
    fastify.inject('/', (err, res) => {
      if (err) {}
      t.strictEqual(res.headers['x-ratelimit-limit'], 2)
      t.strictEqual(res.headers['x-ratelimit-remaining'], 1)
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

test('does not override the preHandler', t => {
  t.plan(5)
  const fastify = Fastify()
  fastify.register(rateLimit, { global: false })

  fastify.get('/', {
    preHandler: function (req, reply, next) {
      t.pass('preHandler called')
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
