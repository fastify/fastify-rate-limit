'use strict'

const fp = require('fastify-plugin')
const FJS = require('fast-json-stringify')
const ms = require('ms')

const LocalStore = require('./store/LocalStore')
const RedisStore = require('./store/RedisStore')

const serializeError = FJS({
  type: 'object',
  properties: {
    statusCode: { type: 'number' },
    error: { type: 'string' },
    message: { type: 'string' }
  }
})

function rateLimitPlugin (fastify, opts, next) {
  const timeWindow = typeof opts.timeWindow === 'string'
    ? ms(opts.timeWindow)
    : typeof opts.timeWindow === 'number'
      ? opts.timeWindow
      : 1000 * 60

  const store = opts.redis
    ? new RedisStore(opts.redis, timeWindow)
    : new LocalStore(timeWindow, opts.cache)

  const keyGenerator = typeof opts.keyGenerator === 'function'
    ? opts.keyGenerator
    : (req) => req.raw.ip

  const skipOnError = opts.skipOnError === true
  const max = opts.max || 1000
  const whitelist = opts.whitelist || []
  const after = ms(timeWindow, { long: true })

  fastify.addHook('onRequest', onRateLimit)

  function onRateLimit (req, res, next) {
    var key = keyGenerator(req)
    if (whitelist.indexOf(key) > -1) {
      next()
    } else {
      store.incr(key, onIncr)
    }

    function onIncr (err, current) {
      if (err && skipOnError === false) return next(err)

      if (current <= max) {
        res.header('X-RateLimit-Limit', max)
        res.header('X-RateLimit-Remaining', max - current)
        next()
      } else {
        res.type('application/json').serializer(serializeError)
        res.code(429)
          .header('X-RateLimit-Limit', max)
          .header('X-RateLimit-Remaining', 0)
          .header('Retry-After', timeWindow)
          .send({
            statusCode: 429,
            error: 'Too Many Requests',
            message: `Rate limit exceeded, retry in ${after}`
          })
      }
    }
  }

  next()
}

module.exports = fp(rateLimitPlugin, {
  fastify: '>=2.x',
  name: 'fastify-rate-limit'
})
