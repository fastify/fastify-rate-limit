'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const rateLimit = require('../../index')

test('issue #469 - LocalStore should not reject all concurrent/pipelined requests when batch exceeds max', async (t) => {
  t.plan(2)
  const fastify = Fastify()

  await fastify.register(rateLimit, {
    max: 5,
    timeWindow: 60000
  })

  fastify.get('/', async () => 'hello!')

  const responses = await Promise.all(
    Array.from({ length: 6 }, () =>
      fastify.inject({
        url: '/',
        method: 'GET'
      })
    )
  )

  t.assert.deepStrictEqual(
    responses.map((res) => res.statusCode),
    [200, 200, 200, 200, 200, 429]
  )
  t.assert.deepStrictEqual(
    responses.map((res) => res.headers['x-ratelimit-remaining']),
    ['4', '3', '2', '1', '0', '0']
  )
})
