'use strict'

const { mock } = require('node:test')
const tap = require('tap')
const assert = require('node:assert')
const Fastify = require('fastify')
const rateLimit = require('../../index')

tap.test("issue #284 - don't set the reply code automatically", async (t) => {
  const clock = mock.timers
  clock.enable()
  const fastify = Fastify()

  await fastify.register(rateLimit, {
    global: false
  })

  fastify.setErrorHandler((err, req, res) => {
    assert.deepStrictEqual(res.statusCode, 200)
    assert.deepStrictEqual(err.statusCode, 429)

    res.redirect('/')
  })

  fastify.get(
    '/',
    {
      config: {
        rateLimit: {
          max: 1,
          timeWindow: 5000,
          continueExceeding: true
        }
      }
    },
    async () => {
      return 'hello!'
    }
  )

  const firstOkResponse = await fastify.inject({
    url: '/',
    method: 'GET'
  })
  const firstRateLimitResponse = await fastify.inject({
    url: '/',
    method: 'GET'
  })

  // After this the rate limiter should allow for new requests
  clock.tick(5000)

  const okResponseAfterRateLimitCompleted = await fastify.inject({
    url: '/',
    method: 'GET'
  })

  assert.deepStrictEqual(firstOkResponse.statusCode, 200)

  assert.deepStrictEqual(firstRateLimitResponse.statusCode, 302)
  assert.deepStrictEqual(
    firstRateLimitResponse.headers['x-ratelimit-limit'],
    '1'
  )
  assert.deepStrictEqual(
    firstRateLimitResponse.headers['x-ratelimit-remaining'],
    '0'
  )
  assert.deepStrictEqual(
    firstRateLimitResponse.headers['x-ratelimit-reset'],
    '5'
  )

  assert.deepStrictEqual(okResponseAfterRateLimitCompleted.statusCode, 200)
  clock.reset(0)

  t.end()
})
