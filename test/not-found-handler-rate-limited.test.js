'use strict'

const tap = require('tap')
const assert = require('node:assert')
const Fastify = require('fastify')
const rateLimit = require('../index')

tap.test('Set not found handler can be rate limited', async (t) => {
  t.plan(18)

  const fastify = Fastify()

  await fastify.register(rateLimit, { max: 2, timeWindow: 1000 })
  assert.ok(fastify.rateLimit)

  fastify.setNotFoundHandler(
    {
      preHandler: fastify.rateLimit()
    },
    function (request, reply) {
      assert.ok('Error handler has been called')
      reply.status(404).send(new Error('Not found'))
    }
  )

  let res
  res = await fastify.inject('/not-found')
  assert.deepStrictEqual(res.statusCode, 404)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
  assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

  res = await fastify.inject('/not-found')
  assert.deepStrictEqual(res.statusCode, 404)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

  res = await fastify.inject('/not-found')
  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')
  assert.deepStrictEqual(res.headers['retry-after'], '1')
  assert.deepStrictEqual(JSON.parse(res.payload), {
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 1 second'
  })

  t.end()
})

tap.test('Set not found handler can be rate limited with specific options', async (t) => {
  t.plan(28)

  const fastify = Fastify()

  await fastify.register(rateLimit, { max: 2, timeWindow: 1000 })
  assert.ok(fastify.rateLimit)

  fastify.setNotFoundHandler(
    {
      preHandler: fastify.rateLimit({
        max: 4,
        timeWindow: 2000
      })
    },
    function (request, reply) {
      assert.ok('Error handler has been called')
      reply.status(404).send(new Error('Not found'))
    }
  )

  let res
  res = await fastify.inject('/not-found')
  assert.deepStrictEqual(res.statusCode, 404)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '4')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '3')
  assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '2')

  res = await fastify.inject('/not-found')
  assert.deepStrictEqual(res.statusCode, 404)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '4')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '2')

  res = await fastify.inject('/not-found')
  assert.deepStrictEqual(res.statusCode, 404)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '4')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
  assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '2')

  res = await fastify.inject('/not-found')
  assert.deepStrictEqual(res.statusCode, 404)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '4')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '2')

  res = await fastify.inject('/not-found')
  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '4')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  assert.deepStrictEqual(res.headers['retry-after'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '2')
  assert.deepStrictEqual(JSON.parse(res.payload), {
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 2 seconds'
  })

  t.end()
})
