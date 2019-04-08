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
  if (rule.whiteListInRedis && !rule.redis) {
    next('you must set redis parameter to use it')
  }

  const max = (typeof rule.max === 'number' || typeof rule.max === 'function')
    ? rule.max
    : 1000
  const globalTimeWindow = typeof rule.timeWindow === 'string'
    ? ms(rule.timeWindow)
    : typeof rule.timeWindow === 'number'
      ? rule.timeWindow
      : 1000 * 60

  const plugin = {
    app: rule.appName || 'default'
  }

  const skipOnError = rule.skipOnError === true

  function cbR (err) {
    if (err && skipOnError === false) return next(err)
  }

  if (rule.redis) {
    plugin.store = new RedisStore(rule.redis)
    if (rule.whiteListInRedis) {
      plugin.store.addWhiteList(`${plugin.app}:wlg`, rule.whitelist || [], cbR)
      plugin.isRedis = true
      plugin.whiteListInRedis = true
    } else {
      plugin.whitelist = {
        global: rule.whitelist || [],
        endpoint: []
      }
      plugin.isRedis = true
      plugin.whiteListInRedis = false
    }
  } else {
    plugin.store = new LocalStore(rule.cache)
    plugin.isRedis = false
    plugin.whiteListInRedis = false
    plugin.whitelist = {
      global: rule.whitelist || [],
      endpoint: {}
    }
  }

  const after = ms(globalTimeWindow, { long: true })

  const keyGenerator = typeof rule.keyGenerator === 'function'
    ? rule.keyGenerator
    : (req) => req.raw.ip

  fastify.addHook('onRoute', (routeOptions) => {
    if (routeOptions.config && routeOptions.config.rateLimit && typeof routeOptions.config.rateLimit === 'object') {
      const params = routeOptions.config.rateLimit

      if (!params.max) {
        params.max = max
      }

      const urlT = (routeOptions.url === '/') ? 'root' : routeOptions.url.replace(/\//g, ':').slice(1)

      const prefix = {
        cache: params.prefixCache ? params.prefixCache.replace(/[-,.;#*]/g, ':') : urlT
      }
      if (plugin.isRedis && plugin.whiteListInRedis) {
        prefix.wl = urlT
        plugin.store.addWhiteList(`${plugin.app}:wle:${prefix.wl}`, params.whitelist, cbR)
      } else {
        plugin.whitelist.endpoint[prefix.cache] = params.whitelist || []
      }

      routeOptions.preHandler = (req, res, next) => {
        var key = keyGenerator(req)

        console.log(plugin)

        if (plugin.isRedis) {
          if (plugin.whiteListInRedis) {
            plugin.store.isWhiteList(`${plugin.app}:wlg`, key, function ([err, result]) {
              if (err && skipOnError === false) return next(err)
              if (result === 1) {
                next()
              }
            })
            plugin.store.isWhiteList(`${plugin.app}:wle:${prefix.wl}`, key, function ([err, result]) {
              if (err && skipOnError === false) return next(err)
              if (result === 1) {
                next()
              }
            })
          }
        } else {
          if (plugin.whitelist.global.indexOf(key) > -1 || plugin.whitelist.endpoint[prefix.cache].indexOf(key) > -1) {
            next()
          }
        }

        plugin.store.incr(prefix.cache, key, globalTimeWindow, onIncr)

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
