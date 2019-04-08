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

function buildRouteRate (pluginComponent, params, routeOptions, next) {
  const urlT = (routeOptions.url === '/') ? 'root' : routeOptions.url.replace(/\//g, ':').slice(1)

  const prefix = {
    cache: params.prefixCache ? params.prefixCache.replace(/[-,.;#*]/g, ':') : urlT
  }
  if (pluginComponent.isRedis && pluginComponent.whiteListInRedis) {
    prefix.wl = urlT
    pluginComponent.store.addWhiteList(`${pluginComponent.app}:wle:${prefix.wl}`, params.whitelist, (err) => {
      if (err && params.skipOnError === false) return next(err)
    })
  } else {
    pluginComponent.whitelist.endpoint[prefix.cache] = params.whitelist || []
  }

  routeOptions.preHandler = (req, res, next) => {
    var key = params.keyGenerator(req)

    if (pluginComponent.isRedis) {
      if (pluginComponent.whiteListInRedis) {
        pluginComponent.store.isWhiteList(`${pluginComponent.app}:wlg`, key, function ([err, result]) {
          if (err && params.skipOnError === false) return next(err)
          if (result === 1) {
            next()
          }
        })
        pluginComponent.store.isWhiteList(`${pluginComponent.app}:wle:${prefix.wl}`, key, function ([err, result]) {
          if (err && params.skipOnError === false) return next(err)
          if (result === 1) {
            next()
          }
        })
      }
    } else {
      if (pluginComponent.whitelist.global.indexOf(key) > -1 || pluginComponent.whitelist.endpoint[prefix.cache].indexOf(key) > -1) {
        next()
      }
    }

    pluginComponent.store.incr(prefix.cache, key, params.globalTimeWindow, onIncr)

    function onIncr (err, current) {
      if (err && params.skipOnError === false) return next(err)

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
          .header('X-RateLimit-Limit', params.max)
          .header('X-RateLimit-Remaining', 0)
          .header('Retry-After', params.globalTimeWindow)
          .send({
            statusCode: 429,
            error: 'Too Many Requests',
            message: `Rate limit exceeded, retry in ${params.after}`
          })
      }
    }
  }
}

function rateLimitPlugin (fastify, settings, next) {
  if (settings.whiteListInRedis && !settings.redis) {
    next('you must set redis parameter to use it')
  }

  const globalParams = {
    global: settings.global || true
  }

  globalParams.max = (typeof settings.max === 'number' || typeof settings.max === 'function')
    ? settings.max
    : 1000

  globalParams.globalTimeWindow = typeof settings.timeWindow === 'string'
    ? ms(settings.timeWindow)
    : typeof settings.timeWindow === 'number'
      ? settings.timeWindow
      : 1000 * 60

  const pluginComponent = {
    app: settings.appName || 'default'
  }

  globalParams.skipOnError = settings.skipOnError === true

  if (settings.redis) {
    pluginComponent.store = new RedisStore(settings.redis)
    if (settings.whiteListInRedis) {
      pluginComponent.store.addWhiteList(`${pluginComponent.app}:wlg`, settings.whitelist || [], (err) => {
        if (err && globalParams.skipOnError === false) return next(err)
      })
      pluginComponent.isRedis = true
      pluginComponent.whiteListInRedis = true
    } else {
      pluginComponent.whitelist = {
        global: settings.whitelist || [],
        endpoint: []
      }
      pluginComponent.isRedis = true
      pluginComponent.whiteListInRedis = false
    }
  } else {
    pluginComponent.store = new LocalStore(settings.cache)
    pluginComponent.isRedis = false
    pluginComponent.whiteListInRedis = false
    pluginComponent.whitelist = {
      global: settings.whitelist || [],
      endpoint: {}
    }
  }

  globalParams.after = ms(globalParams.globalTimeWindow, { long: true })

  globalParams.keyGenerator = typeof settings.keyGenerator === 'function'
    ? settings.keyGenerator
    : (req) => req.raw.ip

  // const makeParams = (p) => { return { ...globalParams, ...p } }

  const makeParams = (p) => { return Object.assign({}, globalParams, p) }

  fastify.addHook('onRoute', (routeOptions) => {
    if (globalParams.global) {
      if (routeOptions.config && routeOptions.config.rateLimit && typeof routeOptions.config.rateLimit === 'object') {
        buildRouteRate(pluginComponent, makeParams(routeOptions.config.rateLimit), routeOptions, next)
      } else {
        buildRouteRate(pluginComponent, globalParams, routeOptions, next)
      }
    } else {
      if (routeOptions.config && routeOptions.config.rateLimit && typeof routeOptions.config.rateLimit === 'object') {
        buildRouteRate(pluginComponent, makeParams(routeOptions.config.rateLimit), routeOptions, next)
      }
    }
  })
  next()
}

module.exports = fp(rateLimitPlugin, {
  fastify: '>=2.x',
  name: 'fastify-rate-limit'
})
