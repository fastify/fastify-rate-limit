'use strict'

const { createReadStream } = require('fs')
const { resolve } = require('path')

async function main () {
  const fastify = require('fastify')()

  await fastify.register(require('../index'),
    {
      global: true,
      throttle: {
        bps: 1000
      }
    })

  fastify.get('/string', (req, reply) => {
    reply.send(Buffer.allocUnsafe(1024 * 1024).toString('ascii'))
  })

  fastify.get('/buffer', (req, reply) => {
    reply.send(Buffer.allocUnsafe(1024 * 1024))
  })

  fastify.get('/stream', (req, reply) => {
    reply.send(createReadStream(resolve(__dirname, '../test/fixtures/random-30kb.file')))
  })

  fastify.get('/delayed', {
    config: {
      rateLimit: {
        throttle: {
          bps: function (elapsedTime, bytes) {
            if (elapsedTime < 2) {
              return 0
            } else {
              return Infinity
            }
          }
        }
      }
    }
  }, (req, reply) => {
    reply.send(createReadStream(resolve(__dirname, __filename)))
  })

  fastify.get('/pojo', (req, reply) => {
    const payload = Array(1000).fill(0).map(v => (Math.random() * 1e6).toString(36))
    reply.send({ payload })
  })

  fastify.listen({ port: 3000 })
}

(async () => await main())()
