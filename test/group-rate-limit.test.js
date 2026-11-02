'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const Fastify = require('fastify')
const rateLimit = require('../index')
const RedisStore = require('../store/RedisStore')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('GroupId from routeConfig', async () => {
  const fastify = Fastify()

  // Register rate limit plugin with groupId in routeConfig
  await fastify.register(rateLimit, { max: 2, timeWindow: 500 })

  fastify.get(
    '/routeWithGroupId',
    {
      config: {
        rateLimit: {
          max: 2,
          timeWindow: 500,
          groupId: 'group1' // groupId specified in routeConfig
        }
      }
    },
    async () => 'hello from route with groupId!'
  )

  // Test: Request should have the correct groupId in response
  const res = await fastify.inject({ url: '/routeWithGroupId', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
})

test('GroupId from routeOptions', async () => {
  const fastify = Fastify()

  // Register rate limit plugin with groupId in routeOptions
  await fastify.register(rateLimit, { max: 2, timeWindow: 500 })

  fastify.get(
    '/routeWithGroupIdFromOptions',
    {
      config: {
        rateLimit: {
          max: 2,
          timeWindow: 500
          // groupId not specified here
        }
      }
    },
    async () => 'hello from route with groupId from options!'
  )

  // Test: Request should have the correct groupId from routeOptions
  const res = await fastify.inject({ url: '/routeWithGroupIdFromOptions', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
})

test('No groupId provided', async () => {
  const fastify = Fastify()

  // Register rate limit plugin without groupId
  await fastify.register(rateLimit, { max: 2, timeWindow: 500 })

  // Route without groupId
  fastify.get(
    '/noGroupId',
    {
      config: {
        rateLimit: {
          max: 2,
          timeWindow: 500
        }
      }
    },
    async () => 'hello from no groupId route!'
  )

  let res

  // Test without groupId
  res = await fastify.inject({ url: '/noGroupId', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  res = await fastify.inject({ url: '/noGroupId', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject({ url: '/noGroupId', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  assert.deepStrictEqual(res.headers['retry-after'], '1')
  assert.deepStrictEqual(
    {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry in 1 second'
    },
    JSON.parse(res.payload)
  )
})

test('With multiple routes and custom groupId', async () => {
  const fastify = Fastify()

  // Register rate limit plugin
  await fastify.register(rateLimit, { max: 2, timeWindow: 500 })

  // Route 1 with groupId 'group1'
  fastify.get(
    '/route1',
    {
      config: {
        rateLimit: {
          max: 2,
          timeWindow: 500,
          groupId: 'group1'
        }
      }
    },
    async () => 'hello from route 1!'
  )

  // Route 2 with groupId 'group2'
  fastify.get(
    '/route2',
    {
      config: {
        rateLimit: {
          max: 2,
          timeWindow: 1000,
          groupId: 'group2'
        }
      }
    },
    async () => 'hello from route 2!'
  )

  let res

  // Test Route 1
  res = await fastify.inject({ url: '/route1', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  res = await fastify.inject({ url: '/route1', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject({ url: '/route1', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  assert.deepStrictEqual(res.headers['retry-after'], '1')
  assert.deepStrictEqual(
    {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry in 1 second'
    },
    JSON.parse(res.payload)
  )

  // Test Route 2
  res = await fastify.inject({ url: '/route2', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  res = await fastify.inject({ url: '/route2', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject({ url: '/route2', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  assert.deepStrictEqual(res.headers['retry-after'], '1')
  assert.deepStrictEqual(
    {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry in 1 second'
    },
    JSON.parse(res.payload)
  )

  // Wait for the window to reset
  await sleep(1000)

  // After reset, Route 1 should succeed again
  res = await fastify.inject({ url: '/route1', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  // Route 2 should also succeed after the reset
  res = await fastify.inject({ url: '/route2', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
})

test('Invalid groupId type', async () => {
  const fastify = Fastify()

  // Register rate limit plugin with a route having an invalid groupId
  await fastify.register(rateLimit, { max: 2, timeWindow: 1000 })

  try {
    fastify.get(
      '/invalidGroupId',
      {
        config: {
          rateLimit: {
            max: 2,
            timeWindow: 1000,
            groupId: 123 // Invalid groupId type
          }
        }
      },
      async () => 'hello with invalid groupId!'
    )
    assert.fail('should throw')
    console.log('HER')
  } catch (err) {
    assert.deepStrictEqual(err.message, 'groupId must be a string')
  }
})

test('Two routes sharing one groupId share the counter', async (t) => {
  const app = Fastify()
  t.after(() => app.close())
  await app.register(rateLimit, { max: 100, timeWindow: 500 })

  const config = { rateLimit: { max: 3, timeWindow: 500, groupId: 'OTP' } }
  app.get('/otp/send', { config }, async () => 'sent')
  app.get('/otp/resend', { config }, async () => 'resent')

  let res = await app.inject({ url: '/otp/send' })
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '2')

  res = await app.inject({ url: '/otp/send' })
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  res = await app.inject({ url: '/otp/send' })
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  // 4th request from resend should be rate limited because the group quota is exhausted
  res = await app.inject({ url: '/otp/resend' })
  assert.deepStrictEqual(res.statusCode, 429)

  // 5th request from send should also be rate limited
  res = await app.inject({ url: '/otp/send' })
  assert.deepStrictEqual(res.statusCode, 429)

  await sleep(550)

  // After timeWindow expires, requests should succeed again
  res = await app.inject({ url: '/otp/resend' })
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '2')
})

test('Two routes without groupId keep separate counters', async (t) => {
  const app = Fastify()
  t.after(() => app.close())
  await app.register(rateLimit, { max: 100, timeWindow: 500 })

  const config = { rateLimit: { max: 2, timeWindow: 500 } }
  app.get('/route-a', { config }, async () => 'a')
  app.get('/route-b', { config }, async () => 'b')

  let res = await app.inject({ url: '/route-a' })
  assert.deepStrictEqual(res.statusCode, 200)
  res = await app.inject({ url: '/route-a' })
  assert.deepStrictEqual(res.statusCode, 200)
  res = await app.inject({ url: '/route-a' })
  assert.deepStrictEqual(res.statusCode, 429)

  // route-b should still have its separate counter untouched
  res = await app.inject({ url: '/route-b' })
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
})

test('RedisStore.child with groupId uses groupId namespace', (t) => {
  t.plan(2)
  const store = new RedisStore(false, false, { rateLimit: true, rateLimitRead: true }, 'fastify-rate-limit-')
  const childWithGroup = store.child({
    groupId: 'shared-group',
    routeInfo: { method: 'GET', url: '/test' }
  })
  t.assert.strictEqual(childWithGroup.key, 'fastify-rate-limit-shared-group-')

  const childWithoutGroup = store.child({
    routeInfo: { method: 'GET', url: '/test' }
  })
  t.assert.strictEqual(childWithoutGroup.key, 'fastify-rate-limit-GET/test-')
})
