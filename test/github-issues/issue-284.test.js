'use strict'

const FakeTimers = require('@sinonjs/fake-timers')
const t = require('tap')
const test = t.test
const Fastify = require('fastify')
const rateLimit = require('../../index')

t.beforeEach(t => {
  t.context.clock = FakeTimers.install()
})

t.afterEach(t => {
  t.context.clock.uninstall()
})

test("issue #284 - don't set the reply code automatically", async t => {
  const fastify = Fastify()

  await fastify.register(rateLimit, {
    global: false
  })

  fastify.setErrorHandler((err, req, res) => {
    t.equal(res.statusCode, 200)
    t.equal(err.statusCode, 429)

    res.redirect('/')
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

  // After this the rate limiter should allow for new requests
  t.context.clock.tick(5000)

  const okResponseAfterRateLimitCompleted = await fastify.inject({
    url: '/',
    method: 'GET'
  })

  t.equal(firstOkResponse.statusCode, 200)

  t.equal(firstRateLimitResponse.statusCode, 302)
  t.equal(firstRateLimitResponse.headers['x-ratelimit-limit'], '1')
  t.equal(firstRateLimitResponse.headers['x-ratelimit-remaining'], '0')
  t.equal(firstRateLimitResponse.headers['x-ratelimit-reset'], '5')

  t.equal(okResponseAfterRateLimitCompleted.statusCode, 200)
})
