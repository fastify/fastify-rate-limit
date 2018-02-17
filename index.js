'use strict'

const fp = require('fastify-plugin')
const lru = require('tiny-lru')
const FJS = require('fast-json-stringify')
const ms = require('ms')

const serializeError = FJS({
  type: 'object',
  properties: {
    statusCode: { type: 'number' },
    error: { type: 'string' },
    message: { type: 'string' }
  }
})

function rateLimitPlugin (fastify, opts, next) {
  const cache = lru(opts.cache || 5000)
  const max = opts.max || 1000
  const timeWindow = typeof opts.timeWindow === 'string'
    ? ms(opts.timeWindow)
    : typeof opts.timeWindow === 'number'
    ? opts.timeWindow
    : 1000 * 60
  const after = ms(timeWindow)

  const interval = setInterval(cache.reset.bind(cache), timeWindow)
  if (interval.unref) interval.unref()

  fastify.addHook('onRequest', onRateLimit)

  function onRateLimit (req, res, next) {
    var ip = req.headers['X-Forwarded-For'] || req.connection.remoteAddress
    var current = cache.get(ip) || 0

    var limitReached = current >= max
    if (limitReached === false) current++
    cache.set(ip, current)

    res.setHeader('X-RateLimit-Limit', max)
    res.setHeader('X-RateLimit-Remaining', max - current)

    if (limitReached === false) {
      next()
    } else {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Retry-After', timeWindow)
      res.statusCode = 429
      res.end(serializeError({
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded, retry in ${after}`
      }))
    }
  }

  next()
}

module.exports = fp(rateLimitPlugin, {
  fastify: '>=0.43.0',
  name: 'fastify-rate-limit'
})
