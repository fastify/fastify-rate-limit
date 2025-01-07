'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const rateLimit = require('../index')

test('Fastify close on local store', async (t) => {
  t.plan(1)
  const fastify = Fastify()
  await fastify.register(rateLimit, { max: 2, timeWindow: 1000 })
  let counter = 1
  fastify.addHook('onClose', (_instance, done) => {
    counter++
    done()
  })
  await fastify.close()
  t.assert.deepStrictEqual(counter, 2)
})
