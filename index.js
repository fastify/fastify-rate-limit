'use strict'

const fp = require('fastify-plugin')
const lru = require('tiny-lru')
const FJS = require('fast-json-stringify')
const ms = require('ms')
const noop = () => {}

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

  const store = opts.store
    ? new RedisStore(opts.store, timeWindow)
    : new LocalStore(lru(opts.cache || 5000), timeWindow)

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
      if (err) return next(err)

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

function LocalStore (store, timeWindow) {
  this.store = store
  const interval = setInterval(this.store.reset.bind(this.store), timeWindow)
  if (interval.unref) interval.unref()
}

LocalStore.prototype.incr = function (ip, cb) {
  var current = this.store.get(ip) || 0
  this.store.set(ip, ++current)
  cb(null, current)
}

function RedisStore (store, timeWindow) {
  this.store = store
  this.timeWindow = timeWindow
  this.key = 'fastify-rate-limit-'
}

RedisStore.prototype.incr = function (ip, cb) {
  var key = this.key + ip
  this.store.pipeline()
    .incr(key)
    .pttl(key)
    .exec((err, result) => {
      if (err) return cb(err)
      if (result[1][1] === -1) {
        this.store.pexpire(key, this.timeWindow, noop)
      }
      cb(null, result[0][1])
    })
}

module.exports = fp(rateLimitPlugin, {
  fastify: '>=1.x',
  name: 'fastify-rate-limit'
})
