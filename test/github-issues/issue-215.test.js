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

test('issue #215 - when using local store, 2nd user should not be rate limited when the time window is passed for the 1st user', async t => {
  t.plan(5)
  const fastify = Fastify()

  fastify.register(rateLimit, {
    global: false
  })

  fastify.get('/', {
    config: {
      rateLimit: {
        max: 1,
        timeWindow: 5000,
        continueExceeding: false
      }
    }
  }, async () => 'hello!')

  const user1FirstRequest = await fastify.inject({
    url: '/',
    method: 'GET',
    remoteAddress: '1.1.1.1'
  })

  // Waiting for the time to pass to make the 2nd user start in a different start point
  t.context.clock.tick(3000)

  const user2FirstRequest = await fastify.inject({
    url: '/',
    method: 'GET',
    remoteAddress: '2.2.2.2'
  })

  const user2SecondRequestAndShouldBeRateLimited = await fastify.inject({
    url: '/',
    method: 'GET',
    remoteAddress: '2.2.2.2'
  })

  // After this the total time passed for the 1st user is 6s and for the 2nd user only 3s
  t.context.clock.tick(3000)

  const user2ThirdRequestAndShouldStillBeRateLimited = await fastify.inject({
    url: '/',
    method: 'GET',
    remoteAddress: '2.2.2.2'
  })

  // After this the total time passed for the 2nd user is 5.1s - he should not be rate limited
  t.context.clock.tick(2100)

  const user2OkResponseAfterRateLimitCompleted = await fastify.inject({
    url: '/',
    method: 'GET',
    remoteAddress: '2.2.2.2'
  })

  t.equal(user1FirstRequest.statusCode, 200)
  t.equal(user2FirstRequest.statusCode, 200)

  t.equal(user2SecondRequestAndShouldBeRateLimited.statusCode, 429)
  t.equal(user2ThirdRequestAndShouldStillBeRateLimited.statusCode, 429)

  t.equal(user2OkResponseAfterRateLimitCompleted.statusCode, 200)
})
