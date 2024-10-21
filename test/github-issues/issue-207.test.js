'use strict'

const { mock } = require('node:test')
const tap = require('tap')
const assert = require('node:assert')
const Fastify = require('fastify')
const rateLimit = require('../../index')

tap.test('issue #207 - when continueExceeding is true and the store is local then it should reset the rate-limit', async (t) => {
  const clock = mock.timers
  clock.enable()
  const fastify = Fastify()

  await fastify.register(rateLimit, {
    global: false
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

  clock.tick(3000)

  const secondRateLimitWithResettingTheRateLimitTimer = await fastify.inject({
    url: '/',
    method: 'GET'
  })

  // after this the total time passed is 6s which WITHOUT `continueExceeding` the next request should be OK
  clock.tick(3000)

  const thirdRateLimitWithResettingTheRateLimitTimer = await fastify.inject({
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

  assert.deepStrictEqual(firstRateLimitResponse.statusCode, 429)
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

  assert.deepStrictEqual(
    secondRateLimitWithResettingTheRateLimitTimer.statusCode,
    429
  )
  assert.deepStrictEqual(
    secondRateLimitWithResettingTheRateLimitTimer.headers['x-ratelimit-limit'],
    '1'
  )
  assert.deepStrictEqual(
    secondRateLimitWithResettingTheRateLimitTimer.headers[
      'x-ratelimit-remaining'
    ],
    '0'
  )
  assert.deepStrictEqual(
    secondRateLimitWithResettingTheRateLimitTimer.headers['x-ratelimit-reset'],
    '5'
  )

  assert.deepStrictEqual(
    thirdRateLimitWithResettingTheRateLimitTimer.statusCode,
    429
  )
  assert.deepStrictEqual(
    thirdRateLimitWithResettingTheRateLimitTimer.headers['x-ratelimit-limit'],
    '1'
  )
  assert.deepStrictEqual(
    thirdRateLimitWithResettingTheRateLimitTimer.headers[
      'x-ratelimit-remaining'
    ],
    '0'
  )
  assert.deepStrictEqual(
    thirdRateLimitWithResettingTheRateLimitTimer.headers['x-ratelimit-reset'],
    '5'
  )

  assert.deepStrictEqual(okResponseAfterRateLimitCompleted.statusCode, 200)
  clock.reset(0)

  t.end()
})
