'use strict'

const { test, mock } = require('node:test')
const Fastify = require('fastify')
const rateLimit = require('../index')

test('With global rate limit options', async t => {
  t.plan(8)
  const clock = mock.timers
  clock.enable(0)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    max: 2,
    timeWindow: 1000
  })

  const checkRateLimit = fastify.createRateLimit()

  fastify.get('/', async (req, reply) => {
    const limit = await checkRateLimit(req)
    return limit
  })

  let res

  res = await fastify.inject('/')

  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: false,
    key: '127.0.0.1',
    max: 2,
    timeWindow: 1000,
    remaining: 1,
    ttl: 1000,
    ttlInSeconds: 1,
    isExceeded: false,
    isBanned: false
  })

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: false,
    key: '127.0.0.1',
    max: 2,
    timeWindow: 1000,
    remaining: 0,
    ttl: 1000,
    ttlInSeconds: 1,
    isExceeded: false,
    isBanned: false
  })

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: false,
    key: '127.0.0.1',
    max: 2,
    timeWindow: 1000,
    remaining: 0,
    ttl: 1000,
    ttlInSeconds: 1,
    isExceeded: true,
    isBanned: false
  })

  clock.tick(1100)

  res = await fastify.inject('/')

  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: false,
    key: '127.0.0.1',
    max: 2,
    timeWindow: 1000,
    remaining: 1,
    ttl: 1000,
    ttlInSeconds: 1,
    isExceeded: false,
    isBanned: false
  })

  clock.reset()
})

test('With custom rate limit options', async t => {
  t.plan(10)
  const clock = mock.timers
  clock.enable(0)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    max: 5,
    timeWindow: 1000
  })

  const checkRateLimit = fastify.createRateLimit({
    max: 2,
    timeWindow: 1000,
    ban: 1
  })

  fastify.get('/', async (req, reply) => {
    const limit = await checkRateLimit(req)
    return limit
  })

  let res

  res = await fastify.inject('/')

  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: false,
    key: '127.0.0.1',
    max: 2,
    timeWindow: 1000,
    remaining: 1,
    ttl: 1000,
    ttlInSeconds: 1,
    isExceeded: false,
    isBanned: false
  })

  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: false,
    key: '127.0.0.1',
    max: 2,
    timeWindow: 1000,
    remaining: 0,
    ttl: 1000,
    ttlInSeconds: 1,
    isExceeded: false,
    isBanned: false
  })

  // should be exceeded now
  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: false,
    key: '127.0.0.1',
    max: 2,
    timeWindow: 1000,
    remaining: 0,
    ttl: 1000,
    ttlInSeconds: 1,
    isExceeded: true,
    isBanned: false
  })

  // should be banned now
  res = await fastify.inject('/')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: false,
    key: '127.0.0.1',
    max: 2,
    timeWindow: 1000,
    remaining: 0,
    ttl: 1000,
    ttlInSeconds: 1,
    isExceeded: true,
    isBanned: true
  })

  clock.tick(1100)

  res = await fastify.inject('/')

  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: false,
    key: '127.0.0.1',
    max: 2,
    timeWindow: 1000,
    remaining: 1,
    ttl: 1000,
    ttlInSeconds: 1,
    isExceeded: false,
    isBanned: false
  })

  clock.reset()
})

test('With allow list', async t => {
  t.plan(2)
  const clock = mock.timers
  clock.enable(0)
  const fastify = Fastify()
  await fastify.register(rateLimit, {
    global: false,
    max: 5,
    timeWindow: 1000
  })

  const checkRateLimit = fastify.createRateLimit({
    allowList: ['127.0.0.1'],
    max: 2,
    timeWindow: 1000
  })

  fastify.get('/', async (req, reply) => {
    const limit = await checkRateLimit(req)
    return limit
  })

  const res = await fastify.inject('/')

  t.assert.deepStrictEqual(res.statusCode, 200)

  // expect a different return type because isAllowed is true
  t.assert.deepStrictEqual(res.json(), {
    isAllowed: true,
    key: '127.0.0.1'
  })
})
