'use strict'

const tap = require('tap')
const assert = require('node:assert')
const Fastify = require('fastify')
const rateLimit = require('../index')

tap.test('Fastify close on local store', async (t) => {
  t.plan(1)
  const fastify = Fastify()
  await fastify.register(rateLimit, { max: 2, timeWindow: 1000 })
  let counter = 1
  fastify.addHook('onClose', (instance, done) => {
    counter++
    done()
  })
  await fastify.close()
  assert.deepStrictEqual(counter, 2)
})
