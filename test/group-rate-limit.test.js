'use strict'

const tap = require('tap')
const assert = require('assert')
const Fastify = require('fastify')
const rateLimit = require('../index')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

tap.test('GroupId from routeConfig', async (t) => {
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
    async (req, reply) => 'hello from route with groupId!'
  )

  // Test: Request should have the correct groupId in response
  const res = await fastify.inject({ url: '/routeWithGroupId', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
})

tap.test('GroupId from routeOptions', async (t) => {
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
    async (req, reply) => 'hello from route with groupId from options!'
  )

  // Test: Request should have the correct groupId from routeOptions
  const res = await fastify.inject({ url: '/routeWithGroupIdFromOptions', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')
})

tap.test('No groupId provided', async (t) => {
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
    async (req, reply) => 'hello from no groupId route!'
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
      message: 'Rate limit exceeded, retry in 500 ms'
    },
    JSON.parse(res.payload)
  )
})

tap.test('With multiple routes and custom groupId', async (t) => {
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
    async (req, reply) => 'hello from route 1!'
  )

  // Route 2 with groupId 'group2'
  fastify.get(
    '/route2',
    {
      config: {
        rateLimit: {
          max: 2,
          timeWindow: 500,
          groupId: 'group2'
        }
      }
    },
    async (req, reply) => 'hello from route 2!'
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
      message: 'Rate limit exceeded, retry in 500 ms'
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
      message: 'Rate limit exceeded, retry in 500 ms'
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

tap.test('Invalid groupId type', async (t) => {
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
      async (req, reply) => 'hello with invalid groupId!'
    )
    assert.fail('should throw')
    console.log('HER')
  } catch (err) {
    assert.deepStrictEqual(err.message, 'groupId must be a string')
  }
})
