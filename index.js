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

  const skipOnError = opts.skipOnError === true
  const max = opts.max || 1000
  const whitelist = opts.whitelist || []
  const after = ms(timeWindow, { long: true })

  fastify.addHook('onRequest', onRateLimit)

  function onRateLimit (req, res, next) {
    var ip = req.headers['X-Forwarded-For'] || req.connection.remoteAddress
    if (whitelist.indexOf(ip) > -1) {
      next()
    } else {
      store.incr(ip, onIncr)
    }

    function onIncr (err, current) {
      if (err && skipOnError === false) return next(err)

      if (current <= max) {
        res.setHeader('X-RateLimit-Limit', max)
        res.setHeader('X-RateLimit-Remaining', max - current)
        next()
      } else {
        res.writeHead(429, {
          'X-RateLimit-Limit': max,
          'X-RateLimit-Remaining': 0,
          'Content-Type': 'application/json',
          'Retry-After': timeWindow
        })
        res.end(serializeError({
          statusCode: 429,
          error: 'Too Many Requests',
          message: `Rate limit exceeded, retry in ${after}`
        }))
      }
    }
  }

  next()
}

module.exports = fp(rateLimitPlugin, {
  fastify: '>=1.x',
  name: 'fastify-rate-limit'
})
