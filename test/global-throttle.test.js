'use strict'

const t = require('tap')
const test = t.test
const Fastify = require('fastify')
const rateLimit = require('../index')
const { createReadStream } = require('fs')
const { resolve } = require('path')
const { assertTimespan } = require('./lib/assertTimespan')

test('should throttle globally', async t => {
  t.plan(1)
  const fastify = Fastify()

  await fastify.register(rateLimit, {
    global: true,
    throttle: {
      bps: 1000
    }
  })

  fastify.get('/throttled', (req, reply) => { reply.send(createReadStream(resolve(__dirname, './fixtures/random-1kb.file'))) })

  const startTime = Date.now()

  await fastify.inject('/throttled')
  assertTimespan(t, startTime, Date.now(), 1000, 30)
})

test('should throttle globally and set the bps', async t => {
  t.plan(1)
  const fastify = Fastify()

  await fastify.register(rateLimit, {
    global: true,
    throttle: {
      bps: 10000
    }
  })

  fastify.get('/throttled', (req, reply) => { reply.send(createReadStream(resolve(__dirname, './fixtures/random-30kb.file'))) })

  const startTime = Date.now()

  await fastify.inject('/throttled')
  assertTimespan(t, startTime, Date.now(), 3000, 30)
})
