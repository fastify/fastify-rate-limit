'use strict'

const t = require('tap')
const test = t.test
const Fastify = require('fastify')
const rateLimit = require('../index')
const { createReadStream } = require('fs')
const { resolve } = require('path')
const { assertTimespan } = require('./lib/assertTimespan')

test('should throttle per route', async t => {
  t.plan(1)
  const fastify = Fastify()

  await fastify.register(rateLimit, {
    global: false
  })

  fastify.get('/throttled', {
    config: {
      rateLimit: {
        throttle: {
          bps: 1000
        }
      }
    }
  }, (req, reply) => { reply.send(createReadStream(resolve(__dirname, './fixtures/random-1kb.file'))) })

  const startTime = Date.now()

  await fastify.inject('/throttled')
  assertTimespan(t, startTime, Date.now(), 1000, 20)
})

test('should throttle per route and set the bps', async t => {
  t.plan(1)
  const fastify = Fastify()

  await fastify.register(rateLimit, {
    global: false
  })

  fastify.get('/throttled', {
    config: {
      rateLimit: {
        throttle: {
          bps: 10000
        }
      }
    }
  }, (req, reply) => { reply.send(createReadStream(resolve(__dirname, './fixtures/random-30kb.file'))) })

  const startTime = Date.now()

  await fastify.inject('/throttled')
  assertTimespan(t, startTime, Date.now(), 3000)
})

test('should throttle per route but not effect other routes', async t => {
  t.plan(1)
  const fastify = Fastify()

  await fastify.register(rateLimit, {
    global: false
  })

  fastify.get('/throttled', {
    config: {
      rateLimit: {
        throttle: {
          bps: 1000
        }
      }
    }
  }, (req, reply) => { reply.send(createReadStream(resolve(__dirname, './fixtures/random-1kb.file'))) })

  fastify.get('/unthrottled', (req, reply) => { reply.send(createReadStream(resolve(__dirname, './fixtures/random-1kb.file'))) })

  const startTime = Date.now()

  await fastify.inject('/unthrottled')
  assertTimespan(t, startTime, Date.now(), 10)
})

test('should throttle streams', async t => {
  t.plan(2)
  const fastify = Fastify()

  await fastify.register(rateLimit, {
    global: false
  })

  fastify.get('/throttled', {
    config: {
      rateLimit: {
        throttle: {
          bps: 1000
        }
      }
    }
  }, (req, reply) => { reply.send(createReadStream(resolve(__dirname, './fixtures/random-1kb.file'))) })

  const startTime = Date.now()

  const response = await fastify.inject('/throttled')
  assertTimespan(t, startTime, Date.now(), 1000)
  t.equal(response.body.length, 1000)
})

test('should throttle Buffer', async t => {
  t.plan(2)
  const fastify = Fastify()

  await fastify.register(rateLimit, {
    global: false
  })

  fastify.get('/throttled', {
    config: {
      rateLimit: {
        throttle: {
          bps: 1000
        }
      }
    }
  }, (req, reply) => { reply.send(Buffer.alloc(1000)) })

  const startTime = Date.now()

  const response = await fastify.inject('/throttled')
  assertTimespan(t, startTime, Date.now(), 1000)
  t.equal(response.body.length, 1000)
})

test('should throttle string', async t => {
  t.plan(2)
  const fastify = Fastify()

  await fastify.register(rateLimit, {
    global: false
  })

  fastify.get('/throttled', {
    config: {
      rateLimit: {
        throttle: {
          bps: 1000
        }
      }
    }
  }, (req, reply) => { reply.send(Buffer.alloc(1000).toString()) })

  const startTime = Date.now()

  const response = await fastify.inject('/throttled')
  assertTimespan(t, startTime, Date.now(), 1000)
  t.equal(response.body.length, 1000)
})

test('should work with onSend-hook assigned as route config', async t => {
  t.plan(3)
  const fastify = Fastify()

  await fastify.register(rateLimit, {
    global: false
  })

  fastify.get('/throttled', {
    onSend: (request, reply, payload, done) => {
      t.ok(true)
      done(null, payload)
    },
    config: {
      rateLimit: {
        throttle: {
          bps: 1000
        }
      }
    }
  }, (req, reply) => { reply.send(Buffer.alloc(1000).toString()) })

  const startTime = Date.now()

  const response = await fastify.inject('/throttled')
  assertTimespan(t, startTime, Date.now(), 1000)
  t.equal(response.body.length, 1000)
})

test('should work with onSend-hook-Array assigned as route config', async t => {
  t.plan(3)
  const fastify = Fastify()

  await fastify.register(rateLimit, {
    global: false
  })

  fastify.get('/throttled', {
    onSend: [(request, reply, payload, done) => {
      t.ok(true)
      done(null, payload)
    }],
    config: {
      rateLimit: {
        throttle: {
          bps: 1000
        }
      }
    }
  }, (req, reply) => { reply.send(Buffer.alloc(1000).toString()) })

  const startTime = Date.now()

  const response = await fastify.inject('/throttled')
  assertTimespan(t, startTime, Date.now(), 1000)
  t.equal(response.body.length, 1000)
})

test('should not error when sending null', async t => {
  t.plan(3)
  const fastify = Fastify()

  await fastify.register(rateLimit, {
    global: false
  })

  fastify.get('/throttled', {
    onSend: [(request, reply, payload, done) => {
      t.ok(true)
      done(null, null)
    }],
    config: {
      rateLimit: {
        throttle: {
          bps: 1000
        }
      }
    }
  }, (req, reply) => { reply.send(null) })

  const startTime = Date.now()

  const response = await fastify.inject('/throttled')
  assertTimespan(t, startTime, Date.now(), 10)
  t.equal(response.body.length, 0)
})
