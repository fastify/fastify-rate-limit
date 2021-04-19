'use strict'

const t = require('tap')
const test = t.test
const Fastify = require('fastify')
const rateLimit = require('../index')

test('Set not found handler can be rate limited', async t => {
  t.plan(18)

  const fastify = Fastify()

  await fastify.register(rateLimit, { max: 2, timeWindow: 1000 })
  t.ok(fastify.rateLimit)

  fastify.setNotFoundHandler({
    preHandler: fastify.rateLimit()
  }, function (request, reply) {
    t.pass('Error handler has been called')
    reply.status(404).send(new Error('Not found'))
  })

  let res
  res = await fastify.inject('/not-found')
  t.equal(res.statusCode, 404)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 1)
  t.equal(res.headers['x-ratelimit-reset'], 1)

  res = await fastify.inject('/not-found')
  t.equal(res.statusCode, 404)
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 0)
  t.equal(res.headers['x-ratelimit-reset'], 0)

  res = await fastify.inject('/not-found')
  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['x-ratelimit-limit'], 2)
  t.equal(res.headers['x-ratelimit-remaining'], 0)
  t.equal(res.headers['retry-after'], 1000)
  t.equal(res.headers['x-ratelimit-reset'], 0)
  t.same(JSON.parse(res.payload), {
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 1 second'
  })
})

test('Set not found handler can be rate limited with specific options', async t => {
  t.plan(28)

  const fastify = Fastify()

  await fastify.register(rateLimit, { max: 2, timeWindow: 1000 })
  t.ok(fastify.rateLimit)

  fastify.setNotFoundHandler({
    preHandler: fastify.rateLimit({
      max: 4,
      timeWindow: 2000
    })
  }, function (request, reply) {
    t.pass('Error handler has been called')
    reply.status(404).send(new Error('Not found'))
  })

  let res
  res = await fastify.inject('/not-found')
  t.equal(res.statusCode, 404)
  t.equal(res.headers['x-ratelimit-limit'], 4)
  t.equal(res.headers['x-ratelimit-remaining'], 3)
  t.equal(res.headers['x-ratelimit-reset'], 1)

  res = await fastify.inject('/not-found')
  t.equal(res.statusCode, 404)
  t.equal(res.headers['x-ratelimit-limit'], 4)
  t.equal(res.headers['x-ratelimit-remaining'], 2)
  t.equal(res.headers['x-ratelimit-reset'], 0)

  res = await fastify.inject('/not-found')
  t.equal(res.statusCode, 404)
  t.equal(res.headers['x-ratelimit-limit'], 4)
  t.equal(res.headers['x-ratelimit-remaining'], 1)
  t.equal(res.headers['x-ratelimit-reset'], 0)

  res = await fastify.inject('/not-found')
  t.equal(res.statusCode, 404)
  t.equal(res.headers['x-ratelimit-limit'], 4)
  t.equal(res.headers['x-ratelimit-remaining'], 0)
  t.equal(res.headers['x-ratelimit-reset'], 0)

  res = await fastify.inject('/not-found')
  t.equal(res.statusCode, 429)
  t.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  t.equal(res.headers['x-ratelimit-limit'], 4)
  t.equal(res.headers['x-ratelimit-remaining'], 0)
  t.equal(res.headers['retry-after'], 2000)
  t.equal(res.headers['x-ratelimit-reset'], 0)
  t.same(JSON.parse(res.payload), {
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded, retry in 2 seconds'
  })
})
