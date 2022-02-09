'use strict'

const t = require('tap')
const test = t.test
const Fastify = require('fastify')
const rateLimit = require('../../index')

test('issue #207 - when continueExceeding is true and the store is local then it should reset the rate-limit', async t => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  const fastify = Fastify()

  fastify.register(rateLimit, {
    global: false
  })

  fastify.get('/', {
    config: {
      rateLimit: {
        max: 1,
        timeWindow: 5000,
        continueExceeding: true
      }
    }
  }, async () => {
    return 'hello!'
  })

  const firstOkResponse = await fastify.inject({
    url: '/',
    method: 'GET'
  })
  const firstRateLimitResponse = await fastify.inject({
    url: '/',
    method: 'GET'
  })

  await sleep(3000)

  const secondRateLimitWithResettingTheRateLimitTimer = await fastify.inject({
    url: '/',
    method: 'GET'
  })

  // after this the total time passed is 6s which WITHOUT `continueExceeding` the next request should be OK
  await sleep(3000)

  const thirdRateLimitWithResettingTheRateLimitTimer = await fastify.inject({
    url: '/',
    method: 'GET'
  })

  // After this the rate limiter should allow for new requests
  await sleep(5000)

  const okResponseAfterRateLimitCompleted = await fastify.inject({
    url: '/',
    method: 'GET'
  })

  t.equal(firstOkResponse.statusCode, 200)

  t.equal(firstRateLimitResponse.statusCode, 429)
  t.equal(firstRateLimitResponse.headers['x-ratelimit-limit'], 1)
  t.equal(firstRateLimitResponse.headers['x-ratelimit-remaining'], 0)
  t.equal(firstRateLimitResponse.headers['x-ratelimit-reset'], 5)

  t.equal(secondRateLimitWithResettingTheRateLimitTimer.statusCode, 429)
  t.equal(secondRateLimitWithResettingTheRateLimitTimer.headers['x-ratelimit-limit'], 1)
  t.equal(secondRateLimitWithResettingTheRateLimitTimer.headers['x-ratelimit-remaining'], 0)
  t.equal(secondRateLimitWithResettingTheRateLimitTimer.headers['x-ratelimit-reset'], 5)

  t.equal(thirdRateLimitWithResettingTheRateLimitTimer.statusCode, 429)
  t.equal(thirdRateLimitWithResettingTheRateLimitTimer.headers['x-ratelimit-limit'], 1)
  t.equal(thirdRateLimitWithResettingTheRateLimitTimer.headers['x-ratelimit-remaining'], 0)
  t.equal(thirdRateLimitWithResettingTheRateLimitTimer.headers['x-ratelimit-reset'], 5)

  t.equal(okResponseAfterRateLimitCompleted.statusCode, 200)
})
