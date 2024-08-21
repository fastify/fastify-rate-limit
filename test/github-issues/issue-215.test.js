'use strict'

const { test, mock } = require('node:test')
const Fastify = require('fastify')
const rateLimit = require('../../index')

test('issue #215 - when using local store, 2nd user should not be rate limited when the time window is passed for the 1st user', async (t) => {
  t.plan(5)
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
          continueExceeding: false
        }
      }
    },
    async () => 'hello!'
  )

  const user1FirstRequest = await fastify.inject({
    url: '/',
    method: 'GET',
    remoteAddress: '1.1.1.1'
  })

  // Waiting for the time to pass to make the 2nd user start in a different start point
  clock.tick(3000)

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
  clock.tick(3000)

  const user2ThirdRequestAndShouldStillBeRateLimited = await fastify.inject({
    url: '/',
    method: 'GET',
    remoteAddress: '2.2.2.2'
  })

  // After this the total time passed for the 2nd user is 5.1s - he should not be rate limited
  clock.tick(2100)

  const user2OkResponseAfterRateLimitCompleted = await fastify.inject({
    url: '/',
    method: 'GET',
    remoteAddress: '2.2.2.2'
  })

  t.assert.deepStrictEqual(user1FirstRequest.statusCode, 200)
  t.assert.deepStrictEqual(user2FirstRequest.statusCode, 200)

  t.assert.deepStrictEqual(
    user2SecondRequestAndShouldBeRateLimited.statusCode,
    429
  )
  t.assert.deepStrictEqual(
    user2ThirdRequestAndShouldStillBeRateLimited.statusCode,
    429
  )

  t.assert.deepStrictEqual(
    user2OkResponseAfterRateLimitCompleted.statusCode,
    200
  )
  clock.reset()
})
