'use strict'

const t = require('tap')
const test = t.test
const Fastify = require('fastify')
const rateLimit = require('../index')

test('Fastify close on local store', t => {
  t.plan(1)
  const fastify = Fastify()
  fastify.register(rateLimit, { max: 2, timeWindow: 1000 })
  let counter = 1
  fastify.addHook('onClose', (instance, done) => {
    counter++
    done()
  })
  fastify.close(() => {
    t.equal(counter, 2)
  })
})
