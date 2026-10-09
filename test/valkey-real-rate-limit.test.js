'use strict'

const Fastify = require('fastify')
const { GlideClient } = require('@valkey/valkey-glide')
const { test } = require('node:test')

const rateLimit = require('../index')

const VALKEY_HOST = process.env.VALKEY_HOST

test('Valkey GLIDE executes rate-limit scripts against Valkey', {
  skip: VALKEY_HOST ? false : 'requires VALKEY_HOST'
}, async (t) => {
  const client = await GlideClient.createClient({
    addresses: [{ host: VALKEY_HOST, port: 6379 }]
  })
  const fastify = Fastify()
  const nameSpace = `fastify-rate-limit-valkey-${process.pid}-${Date.now()}-`
  const clientId = 'integration-client'

  t.after(async () => {
    await client.del([nameSpace + clientId])
    await fastify.close()
    client.close()
  })

  await fastify.register(rateLimit, {
    global: false,
    max: 2,
    timeWindow: 5000,
    nameSpace,
    keyGenerator: (req) => req.headers['x-client-id'],
    valkey: client
  })

  const checkRateLimit = fastify.createRateLimit()
  fastify.get('/', async (req) => checkRateLimit(req))
  fastify.get('/peek', async (req) => checkRateLimit(req, { increment: false }))

  let result = (await fastify.inject({
    url: '/',
    headers: {
      'x-client-id': clientId
    }
  })).json()

  t.assert.strictEqual(result.remaining, 1)
  t.assert.ok(result.ttl > 0)

  result = (await fastify.inject({
    url: '/peek',
    headers: {
      'x-client-id': clientId
    }
  })).json()

  t.assert.strictEqual(result.remaining, 1)
  t.assert.ok(result.ttl > 0)
})
