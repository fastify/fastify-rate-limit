'use strict'

const { describe, test, mock } = require('node:test')
const Fastify = require('fastify')
const { fastifyRateLimit } = require('../index')

describe('Manual check rate limit', () => {
  test('Basic limit checks', async (t) => {
    t.plan(13)
    const clock = mock.timers
    clock.enable(0)
    const fastify = Fastify()
    await fastify.register(fastifyRateLimit, { global: false })

    const checkRateLimit = fastify.createRateLimit({ max: 2, timeWindow: 1000 })

    fastify.get('/', async (req, reply) => {
      const limit = await checkRateLimit(req)
      const iteration = req.query.request
      console.log('req', req.query.request)
      console.log('limit', limit)
      t.assert.deepStrictEqual(limit.isAllowed, false)
      if (iteration === '3') {
        t.assert.deepStrictEqual(limit.isExceeded, true)
      } else {
        t.assert.deepStrictEqual(limit.isExceeded, false)
      }
      return reply
        .code(limit.isExceeded ? 429 : 200)
        .header('x-ratelimit-limit', limit.max)
        .header('x-ratelimit-remaining', limit.remaining)
        .header('x-ratelimit-reset', limit.reset)
        .send('hello!')
    })

    let res

    res = await fastify.inject('/?request=1')

    t.assert.deepStrictEqual(res.statusCode, 200)
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

    res = await fastify.inject('/?request=2')

    t.assert.deepStrictEqual(res.statusCode, 200)
    t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
    t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

    res = await fastify.inject('/?request=3')

    t.assert.deepStrictEqual(res.statusCode, 429)

    clock.reset()
  })
})
