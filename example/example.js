// var Redis = require('ioredis')
// var redis = new Redis()

const fastify = require('fastify')()

fastify.register(require('../../fastify-rate-limit'),
  {
    max: 3000, // default 1000
    // timeWindow: 1000*60, // default 1000 * 60
    // cache: 10000, // default 5000
    // whitelist: ['127.0.0.1'],
    // redis: redis, // default null
    skipOnError: false // default false
    // keyGenerator: function(req) { /* ... */ }, // default (req) => req.raw.ip
  })

fastify.get('/', {
  config: {
    rateLimit: {
      max: 3,
      // whitelist : ['127.0.1.1'],
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
      whitelist: ['127.0.2.1'],
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
      whitelist: ['127.0.2.1'],
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

fastify.listen(3000, err => {
  if (err) throw err
  console.log('Server listening at http://localhost:3000')
})
