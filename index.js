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

function rateLimitPlugin (fastify, rule, next) {


  const max = (typeof rule.max === 'number' || typeof rule.max === 'function')
    ? rule.max
    : 1000

  const globalTimeWindow = typeof rule.timeWindow === 'string'
    ? ms(rule.timeWindow)
    : typeof rule.timeWindow === 'number'
      ? rule.timeWindow
      : 1000 * 60

  const store = rule.redis
    ? new RedisStore(rule.redis)
    : new LocalStore(rule.cache)

  const skipOnError = rule.skipOnError === true
  const whitelist = {
    redis : !!rule.redis,         //for futur usage after first review.
    global : rule.whitelist || [],
    endpoint : []
  }
  const after = ms(globalTimeWindow, { long: true })

  const keyGenerator = typeof rule.keyGenerator === 'function'
    ? rule.keyGenerator
    : (req) => req.raw.ip

  fastify.addHook('onRoute', (routeOptions) => {
    if (routeOptions.config && routeOptions.config.rateLimit && typeof routeOptions.config.rateLimit === 'object') {

      const params = routeOptions.config.rateLimit

      if(!params.max) {
        params.max = max;
      }

      routeOptions.preHandler = (req, res, next) => {

        const prefix = params.prefixCache || `${req.raw.url.replace(/\//g, '-').slice(1)}`


        var key = keyGenerator(req)

        if (whitelist.global.indexOf(key) > -1) {
          next()
        } else {
          if(whitelist.endpoint.indexOf(key) > -1) {
            next()
          }
          store.incr(prefix, key, globalTimeWindow, onIncr)
        }

        function onIncr (err, current) {
          if (err && skipOnError === false) return next(err)

          if (current <= params.max) {
            res.header('X-RateLimit-Limit', params.max)
            res.header('X-RateLimit-Remaining', params.max - current)

            if (typeof params.onExceeding === 'function') {
              params.onExceeding(req)
            }

            next()
          } else {

            if (typeof params.onExceeded === 'function') {
              params.onExceeded(req)
            }

            res.type('application/json').serializer(serializeError)
            res.code(429)
              .header('X-RateLimit-Limit', max)
              .header('X-RateLimit-Remaining', 0)
              .header('Retry-After', globalTimeWindow)
              .send({
                statusCode: 429,
                error: 'Too Many Requests',
                message: `Rate limit exceeded, retry in ${after}`
              })

          }
        }
      }
    }
  })
  next()
}

module.exports = fp(rateLimitPlugin, {
  fastify: '>=2.x',
  name: 'fastify-rate-limit'
})