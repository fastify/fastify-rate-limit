'use strict'

const Fastify = require('fastify')
const { test } = require('node:test')

const rateLimit = require('../index')

test('Valkey supports consuming and reading rate-limit state', async (t) => {
  const counters = new Map()
  const valkey = {
    invokeScript: async (_script, options) => {
      const key = options.keys[0]

      if (!options.args) {
        const current = counters.get(key) || 0
        return [current, current === 0 ? 0 : 1000]
      }

      const current = (counters.get(key) || 0) + 1
      counters.set(key, current)
      return [current, Number(options.args[0])]
    }
  }
  const fastify = Fastify()
  t.after(() => fastify.close())

  await fastify.register(rateLimit, {
    global: false,
    max: 2,
    timeWindow: 1000,
    nameSpace: 'test:',
    valkey
  })

  const checkRateLimit = fastify.createRateLimit()
  fastify.get('/consume', async (req) => checkRateLimit(req))
  fastify.get('/peek', async (req) => checkRateLimit(req, { increment: false }))

  let result = (await fastify.inject('/peek')).json()
  t.assert.strictEqual(result.remaining, 2)
  t.assert.strictEqual(result.ttl, 0)

  result = (await fastify.inject('/consume')).json()
  t.assert.strictEqual(result.remaining, 1)

  result = (await fastify.inject('/peek')).json()
  t.assert.strictEqual(result.remaining, 1)

  result = (await fastify.inject('/consume')).json()
  t.assert.strictEqual(result.remaining, 0)

  result = (await fastify.inject('/consume')).json()
  t.assert.strictEqual(result.isExceeded, true)
})

test('redis and valkey are alternatives unless a custom store takes precedence', async (t) => {
  const conflicting = Fastify()
  t.after(() => conflicting.close())
  conflicting.register(rateLimit, {
    redis: {},
    valkey: { invokeScript: async () => [0, 0] }
  })

  await t.assert.rejects(
    conflicting.ready(),
    new Error('redis and valkey cannot be used together')
  )

  function CustomStore () {}

  const custom = Fastify()
  t.after(() => custom.close())
  custom.register(rateLimit, {
    global: false,
    store: CustomStore,
    redis: {},
    valkey: {}
  })

  await custom.ready()
})
