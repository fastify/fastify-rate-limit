'use strict'

const t = require('tap')
const test = t.test
const Fastify = require('fastify')
const rateLimit = require('./index')

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
