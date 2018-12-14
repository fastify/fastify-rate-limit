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
  const globalTimeWindow = typeof opts.timeWindow === 'string'
    ? ms(opts.timeWindow)
    : typeof opts.timeWindow === 'number'
      ? opts.timeWindow
      : 1000 * 60

  const store = opts.redis
    ? new RedisStore(opts.redis)
    : new LocalStore(opts.cache)

  const keyGenerator = typeof opts.keyGenerator === 'function'
    ? opts.keyGenerator
    : (req) => req.raw.ip

  const skipOnError = opts.skipOnError === true
  const whitelist = opts.whitelist || []
  const rules = {}

  if (opts.max) {
    rules.global = {
      max: opts.max,
      timeWindow: globalTimeWindow,
      after: ms(globalTimeWindow, { long: true })
    }
  }

  opts.special && opts.special.length && opts.special.forEach(({ url, max, timeWindow }) => {
    const ruleMax = max || opts.max
    const ruleTimeWindow = timeWindow || globalTimeWindow

    rules[url] = {
      max: ruleMax,
      timeWindow: ruleTimeWindow,
      after: ms(ruleTimeWindow, { long: true })
    }
  })

  fastify.addHook('onRequest', onRateLimit)

  function onRateLimit (req, res, next) {
    const key = keyGenerator(req)
    const rule = rules[req.raw.url] || rules.global

    if (whitelist.includes(key) || !rule) {
      return next()
    }

    const { max, timeWindow, after } = rule
    const storeKey = `${key}-${req.raw.url}`

    store.incr(storeKey, timeWindow, onIncr)

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
