'use strict'

const t = require('tap')
const test = t.test
const Fastify = require('fastify')
const rateLimit = require('../index')

test('Set not found handler can be rate limited', t => {
  t.plan(27)
  const fastify = Fastify()
  fastify.register(rateLimit, { max: 2, timeWindow: 1000 }).then(() => {

    t.ok(fastify.rateLimit)

    fastify.setNotFoundHandler({
      preHandler: fastify.rateLimit
    }, function (request, reply) {
      t.pass('Error handler has been called')
      reply.status(404).send(new Error('Not found'))
    })

    fastify.inject('/not-found', (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 404)
      t.strictEqual(res.headers['x-ratelimit-limit'], 2)
      t.strictEqual(res.headers['x-ratelimit-remaining'], 1)
      t.strictEqual(res.headers['x-ratelimit-reset'], 1)

      fastify.inject('/not-found', (err, res) => {
        t.error(err)
        t.strictEqual(res.statusCode, 404)
        t.strictEqual(res.headers['x-ratelimit-limit'], 2)
        t.strictEqual(res.headers['x-ratelimit-remaining'], 0)
        t.strictEqual(res.headers['x-ratelimit-reset'], 0)

        fastify.inject('/not-found', (err, res) => {
          t.error(err)
          t.strictEqual(res.statusCode, 429)
          t.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8')
          t.strictEqual(res.headers['x-ratelimit-limit'], 2)
          t.strictEqual(res.headers['x-ratelimit-remaining'], 0)
          t.strictEqual(res.headers['retry-after'], 1000)
          t.strictEqual(res.headers['x-ratelimit-reset'], 0)
          t.deepEqual(JSON.parse(res.payload), {
            statusCode: 429,
            error: 'Too Many Requests',
            message: 'Rate limit exceeded, retry in 1 second'
          })

          setTimeout(retry, 1100)
        })
      })
    })
  })

  function retry () {
    fastify.inject('/not-found', (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 404)
      t.strictEqual(res.headers['x-ratelimit-limit'], 2)
      t.strictEqual(res.headers['x-ratelimit-remaining'], 1)
      t.strictEqual(res.headers['x-ratelimit-reset'], 1)
    })
  }
})
