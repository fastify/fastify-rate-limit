const { test, mock } = require('node:test')
const Fastify = require('fastify')
const rateLimit = require('../index')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('With multiple routes and custom groupId', async (t) => {
  const clock = mock.timers
  clock.enable(0)
  const fastify = Fastify()

  // Register rate limit plugin
  await fastify.register(rateLimit, { max: 2, timeWindow: 1000 })

  // Route 1 with groupId 'group1'
  fastify.get('/route1', {
    config: {
      rateLimit: {
        max: 2,
        timeWindow: 1000,
        groupId: 'group1'
      }
    }
  }, async (req, reply) => 'hello from route 1!')

  // Route 2 with groupId 'group2'
  fastify.get('/route2', {
    config: {
      rateLimit: {
        max: 2,
        timeWindow: 1000,
        groupId: 'group2'
      }
    }
  }, async (req, reply) => 'hello from route 2!')

  let res

  // Test Route 1
  res = await fastify.inject('/route1')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  res = await fastify.inject('/route1')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject('/route1')
  t.assert.deepStrictEqual(res.statusCode, 429)
  await sleep(10)
  t.assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['retry-after'], '1')
  await sleep(10)
  t.assert.deepStrictEqual(
    {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry in 1 second'
    },
    JSON.parse(res.payload)
  )

  // Test Route 2
  res = await fastify.inject('/route2')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  res = await fastify.inject('/route2')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject('/route2')
  t.assert.deepStrictEqual(res.statusCode, 429)
  t.assert.deepStrictEqual(
    res.headers['content-type'],
    'application/json; charset=utf-8'
  )
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')
  t.assert.deepStrictEqual(res.headers['retry-after'], '1')
  t.assert.deepStrictEqual(
    {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry in 1 second'
    },
    JSON.parse(res.payload)
  )

  // Wait for the window to reset
  clock.tick(1100)

  // After reset, Route 1 should succeed again
  res = await fastify.inject('/route1')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  // Route 2 should also succeed after the reset
  res = await fastify.inject('/route2')
  t.assert.deepStrictEqual(res.statusCode, 200)
  t.assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  t.assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  clock.reset()
})

test('Invalid groupId type', async (t) => {
  t.plan(1)
  const fastify = Fastify()

  // Register rate limit plugin with a route having an invalid groupId
  await fastify.register(rateLimit, { max: 2, timeWindow: 1000 })

  fastify.get('/invalidGroupId', {
    config: {
      rateLimit: {
        max: 2,
        timeWindow: 1000,
        groupId: 123 // Invalid groupId type
      }
    }
  }, async (req, reply) => 'hello with invalid groupId!')

  try {
    await fastify.inject('/invalidGroupId')
    t.fail('should throw')
  } catch (err) {
    t.assert.deepStrictEqual(err.message, ('groupId must be a string'))
  }
})
