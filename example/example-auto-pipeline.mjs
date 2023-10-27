'use strict'

import Redis from 'ioredis'
import Fastify from 'fastify'

const redis = new Redis({
  enableAutoPipelining: true,
  connectionName: 'my-connection-name',
  host: 'localhost',
  port: 6379,
  connectTimeout: 500,
  maxRetriesPerRequest: 1
})

const fastify = Fastify()

await fastify.register(import('../index.js'),
  {
    global: false,
    max: 3000, // default max rate limit
    // timeWindow: 1000*60,
    // cache: 10000,
    allowList: ['127.0.0.2'], // global allowList access ( ACL based on the key from the keyGenerator)
    redis, // connection to redis
    skipOnError: false // default false
    // keyGenerator: function(req) { /* ... */ }, // default (req) => req.raw.ip
  })

fastify.get('/', {
  config: {
    rateLimit: {
      max: 3,
      timeWindow: '1 minute'
    }
  }
}, (req, reply) => {
  reply.send({ hello: 'from ... root' })
})

fastify.get('/private', {
  config: {
    rateLimit: {
      max: 3,
      allowList: ['127.0.2.1', '127.0.3.1'],
      timeWindow: '1 minute'
    }
  }
}, (req, reply) => {
  reply.send({ hello: 'from ... private' })
})

fastify.get('/public', (req, reply) => {
  reply.send({ hello: 'from ... public' })
})

fastify.get('/public/sub-rated-1', {
  config: {
    rateLimit: {
      timeWindow: '1 minute',
      allowList: ['127.0.2.1'],
      onExceeding: function (req) {
        console.log('callback on exceededing ... executed before response to client. req is give as argument')
      },
      onExceeded: function (req) {
        console.log('callback on exceeded ... to black ip in security group for example, req is give as argument')
      }
    }
  }
}, (req, reply) => {
  reply.send({ hello: 'from sub-rated-1 ... using default max value ... ' })
})

fastify.get('/public/sub-rated-2', {
  config: {
    rateLimit: {
      max: 3,
      timeWindow: '1 minute',
      onExceeding: function (req) {
        console.log('callback on exceededing ... executed before response to client. req is give as argument')
      },
      onExceeded: function (req) {
        console.log('callback on exceeded ... to black ip in security group for example, req is give as argument')
      }
    }
  }
}, (req, reply) => {
  reply.send({ hello: 'from ... sub-rated-2' })
})

fastify.get('/home', {
  config: {
    rateLimit: {
      max: 200,
      timeWindow: '1 minute'
    }
  }
}, (req, reply) => {
  reply.send({ hello: 'toto' })
})

fastify.get('/customerrormessage', {
  config: {
    rateLimit: {
      max: 2,
      timeWindow: '1 minute',
      errorResponseBuilder: (req, context) => ({ code: 429, timeWindow: context.after, limit: context.max })
    }
  }
}, (req, reply) => {
  reply.send({ hello: 'toto' })
})

fastify.listen({ port: 3000 }, err => {
  if (err) throw err
  console.log('Server listening at http://localhost:3000')
})
