'use strict'

const t = require('tap')
const test = t.test
const Redis = require('ioredis')
const Fastify = require('fastify')
const rateLimit = require('./index')
const noop = () => {}

test('Basic', t => {
  t.plan(19)
  const fastify = Fastify()
  fastify.register(rateLimit, { max: 2, timeWindow: 1000 })

  fastify.get('/', {
    config: {
      rateLimit: {
        max: 2
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
  fastify.register(rateLimit, { max: 2, timeWindow: '1s' })

  fastify.get('/', {
    config: {
      rateLimit: {
        max: 2,
        timeWindow: '1s'
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
  fastify.register(rateLimit, { whitelist: ['127.0.0.1'] })

  fastify.get('/', {
    config: {
      rateLimit: {
        max: 2,
        timeWindow: '2s'
      }
    }
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
  const redis = new Redis({ host: '127.0.0.1' })
  fastify.register(rateLimit, { max: 2, timeWindow: 1000, redis: redis })

  fastify.get('/', {
    config: {
      rateLimit: {}
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
  const redis = new Redis({ host: '127.0.0.1' })
  fastify.register(rateLimit, {
    redis: redis,
    skipOnError: true
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

  fastify.get('/', {
    config: {
      rateLimit: {}
    }
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

test('With special list and global max', t => {
  t.plan(19)

  const fastify = Fastify()
  const SPECIAL_URL = '/special-rate'

  fastify.register(rateLimit, {
    max: 2,
    timeWindow: 1000,
    special: [{
      url: SPECIAL_URL,
      max: 1,
      timeWindow: 2000
    }]
  })

  fastify.get('/', {
    config: {
      rateLimit: {
        max: 2
      }
    }
  }, (req, reply) => {
    reply.send('hello!')
  })
  fastify.get(SPECIAL_URL, {
    config: {
      rateLimit: {
        max: 1,
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
  })

  fastify.inject(SPECIAL_URL, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.headers['x-ratelimit-limit'], 1)
    t.strictEqual(res.headers['x-ratelimit-remaining'], 0)

    fastify.inject(SPECIAL_URL, (err, res) => {
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

      setTimeout(() => {
        fastify.inject(SPECIAL_URL, (err, res) => {
          t.error(err)
          t.strictEqual(res.statusCode, 200)
          t.strictEqual(res.headers['x-ratelimit-limit'], 1)
          t.strictEqual(res.headers['x-ratelimit-remaining'], 0)
        })
      }, 2100)
    })
  })
})

test('With special list and no global max', t => {
  t.plan(4)

  const fastify = Fastify()

  fastify.register(rateLimit, {
    special: [{
      url: '/special-rate',
      max: 1
    }]
  })

  fastify.get('/', (req, reply) => {
    reply.send('hello!')
  })
  fastify.get('/special-rate', {
    config: {
      rateLimit: {
        max: 1
      }
    }
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
