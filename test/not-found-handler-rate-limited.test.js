'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const rateLimit = require('../index')

test('Set not found handler can be rate limited', async (t) => {
  t.plan(18)

  const fastify = Fastify()

  await fastify.register(rateLimit, { max: 2, timeWindow: 1000 })
  t.assert.ok(fastify.rateLimit)

  fastify.setNotFoundHandler(
    {
      preHandler: fastify.rateLimit()
    },
    function (_request, reply) {
      t.assert.ok('Error handler has been called')
      reply.status(404).send(new Error('Not found'))
    }
  )

  let res
  res = await fastify.inject('/not-found')
  t.assert.deepStrictEqual(res.statusCode, 404)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

  res = await fastify.inject('/not-found')
  t.assert.deepStrictEqual(res.statusCode, 404)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')

  res = await fastify.inject('/not-found')
  t.assert.deepStrictEqual(res.statusCode, 429)
  t.assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '1')
  t.assert.deepStrictEqual(res.headers['retry-after'], '1')
  t.assert.deepStrictEqual(JSON.parse(res.payload), {
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 1 second'
  })
})

test('Set not found handler can be rate limited with specific options', async (t) => {
  t.plan(28)

  const fastify = Fastify()

  await fastify.register(rateLimit, { max: 2, timeWindow: 1000 })
  t.assert.ok(fastify.rateLimit)

  fastify.setNotFoundHandler(
    {
      preHandler: fastify.rateLimit({
        max: 4,
        timeWindow: 2000
      })
    },
    function (_request, reply) {
      t.assert.ok('Error handler has been called')
      reply.status(404).send(new Error('Not found'))
    }
  )

  let res
  res = await fastify.inject('/not-found')
  t.assert.deepStrictEqual(res.statusCode, 404)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '4')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '3')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '2')

  res = await fastify.inject('/not-found')
  t.assert.deepStrictEqual(res.statusCode, 404)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '4')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '2')

  res = await fastify.inject('/not-found')
  t.assert.deepStrictEqual(res.statusCode, 404)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '4')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '2')

  res = await fastify.inject('/not-found')
  t.assert.deepStrictEqual(res.statusCode, 404)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '4')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '2')

  res = await fastify.inject('/not-found')
  t.assert.deepStrictEqual(res.statusCode, 429)
  t.assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '4')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['retry-after'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-reset'], '2')
  t.assert.deepStrictEqual(JSON.parse(res.payload), {
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 2 seconds'
  })
})
