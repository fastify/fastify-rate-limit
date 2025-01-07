'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const Fastify = require('fastify')
const rateLimit = require('../index')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('Exponential Backoff', async () => {
  const fastify = Fastify()

  // Register rate limit plugin with exponentialBackoff set to true in routeConfig
  await fastify.register(rateLimit, { max: 2, timeWindow: 500 })

  fastify.get(
    '/expoential-backoff',
    {
      config: {
        rateLimit: {
          max: 2,
          timeWindow: 500,
          exponentialBackoff: true
        }
      }
    },
    async () => 'exponential backoff applied!'
  )

  // Test
  const res = await fastify.inject({ url: '/expoential-backoff', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  const res2 = await fastify.inject({ url: '/expoential-backoff', method: 'GET' })
  assert.deepStrictEqual(res2.statusCode, 200)
  assert.deepStrictEqual(res2.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res2.headers['x-ratelimit-remaining'], '0')

  const res3 = await fastify.inject({ url: '/expoential-backoff', method: 'GET' })
  assert.deepStrictEqual(res3.statusCode, 429)
  assert.deepStrictEqual(res3.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res3.headers['x-ratelimit-remaining'], '0')
  assert.deepStrictEqual(
    {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry in 1 second'
    },
    JSON.parse(res3.payload)
  )

  const res4 = await fastify.inject({ url: '/expoential-backoff', method: 'GET' })
  assert.deepStrictEqual(res4.statusCode, 429)
  assert.deepStrictEqual(res4.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res4.headers['x-ratelimit-remaining'], '0')
  assert.deepStrictEqual(
    {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry in 1 second'
    },
    JSON.parse(res4.payload)
  )

  // Wait for the window to reset
  await sleep(1000)
  const res5 = await fastify.inject({ url: '/expoential-backoff', method: 'GET' })
  assert.deepStrictEqual(res5.statusCode, 200)
  assert.deepStrictEqual(res5.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res5.headers['x-ratelimit-remaining'], '1')
})

test('Global Exponential Backoff', async () => {
  const fastify = Fastify()

  // Register rate limit plugin with exponentialBackoff set to true in routeConfig
  await fastify.register(rateLimit, { max: 2, timeWindow: 500, exponentialBackoff: true })

  fastify.get(
    '/expoential-backoff-global',
    {
      config: {
        rateLimit: {
          max: 2,
          timeWindow: 500
        }
      }
    },
    async () => 'exponential backoff applied!'
  )

  // Test
  let res
  res = await fastify.inject({ url: '/expoential-backoff-global', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  res = await fastify.inject({ url: '/expoential-backoff-global', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject({ url: '/expoential-backoff-global', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(
    {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry in 1 second'
    },
    JSON.parse(res.payload)
  )

  res = await fastify.inject({ url: '/expoential-backoff-global', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(
    {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry in 1 second'
    },
    JSON.parse(res.payload)
  )

  res = await fastify.inject({ url: '/expoential-backoff-global', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(
    {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry in 2 seconds'
    },
    JSON.parse(res.payload)
  )

  res = await fastify.inject({ url: '/expoential-backoff-global', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(
    {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry in 4 seconds'
    },
    JSON.parse(res.payload)
  )
})

test('MAx safe Exponential Backoff', async () => {
  const fastify = Fastify()

  // Register rate limit plugin with exponentialBackoff set to true in routeConfig
  await fastify.register(rateLimit, { max: 2, timeWindow: 500, exponentialBackoff: true })

  fastify.get(
    '/expoential-backoff-global',
    {
      config: {
        rateLimit: {
          max: 2,
          timeWindow: '285421 years'
        }
      }
    },
    async () => 'exponential backoff applied!'
  )

  // Test
  let res
  res = await fastify.inject({ url: '/expoential-backoff-global', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '1')

  res = await fastify.inject({ url: '/expoential-backoff-global', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(res.headers['x-ratelimit-remaining'], '0')

  res = await fastify.inject({ url: '/expoential-backoff-global', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(
    {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry in 285421 years'
    },
    JSON.parse(res.payload)
  )

  res = await fastify.inject({ url: '/expoential-backoff-global', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(
    {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry in 285421 years'
    },
    JSON.parse(res.payload)
  )

  res = await fastify.inject({ url: '/expoential-backoff-global', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(
    {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry in 285421 years'
    },
    JSON.parse(res.payload)
  )

  res = await fastify.inject({ url: '/expoential-backoff-global', method: 'GET' })
  assert.deepStrictEqual(res.statusCode, 429)
  assert.deepStrictEqual(res.headers['x-ratelimit-limit'], '2')
  assert.deepStrictEqual(
    {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded, retry in 285421 years'
    },
    JSON.parse(res.payload)
  )
})
