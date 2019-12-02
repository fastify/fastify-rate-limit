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

function rateLimitPlugin (fastify, settings, next) {
  // create the object that will hold the "main" settings that can be shared during the build
  // 'global' will define, if the rate limit should be apply by default on all route. default : true
  const globalParams = {
    global: (typeof settings.global === 'boolean') ? settings.global : true
  }

  globalParams.addHeaders = Object.assign({
    'x-ratelimit-limit': true,
    'x-ratelimit-remaining': true,
    'x-ratelimit-reset': true,
    'retry-after': true
  }, settings.addHeaders)

  // define the global maximum of request allowed
  globalParams.max = (typeof settings.max === 'number' || typeof settings.max === 'function')
    ? settings.max
    : 1000

  // define the global Time Window
  globalParams.timeWindow = typeof settings.timeWindow === 'string'
    ? ms(settings.timeWindow)
    : typeof settings.timeWindow === 'number'
      ? settings.timeWindow
      : 1000 * 60

  globalParams.whitelist = settings.whitelist || null
  globalParams.ban = settings.ban || null

  // define the name of the app component. Related to redis, it will be use as a part of the keyname define in redis.
  const pluginComponent = {
    whitelist: globalParams.whitelist
  }

  if (settings.store) {
    const Store = settings.store
    pluginComponent.store = new Store(globalParams)
  } else {
    if (settings.redis) {
      pluginComponent.store = new RedisStore(settings.redis, 'fastify-rate-limit-', globalParams.timeWindow)
    } else {
      pluginComponent.store = new LocalStore(globalParams.timeWindow, settings.cache, fastify)
    }
  }

  globalParams.keyGenerator = typeof settings.keyGenerator === 'function'
    ? settings.keyGenerator
    : (req) => req.raw.ip

  globalParams.errorResponseBuilder = (req, context) => ({ statusCode: context.statusCode, error: 'Too Many Requests', message: `Rate limit exceeded, retry in ${context.after}` })
  globalParams.isCustomErrorMessage = false

  // define if error message was overwritten with a custom error response callback
  if (typeof settings.errorResponseBuilder === 'function') {
    globalParams.errorResponseBuilder = settings.errorResponseBuilder
    globalParams.isCustomErrorMessage = true
  }

  // onRoute add the preHandler rate-limit function if needed
  fastify.addHook('onRoute', (routeOptions) => {
    if (routeOptions.config && typeof routeOptions.config.rateLimit !== 'undefined') {
      if (typeof routeOptions.config.rateLimit === 'object') {
        const current = Object.create(pluginComponent)
        const mergedRateLimitParams = makeParams(routeOptions.config.rateLimit)
        if (!routeOptions.config.rateLimit.timeWindow) {
          // load the global timewindow if it is missing from the route config
          routeOptions.config.rateLimit.timeWindow = mergedRateLimitParams.timeWindow
        }
        current.store = pluginComponent.store.child(routeOptions)
        // if the current endpoint have a custom rateLimit configuration ...
        buildRouteRate(current, mergedRateLimitParams, routeOptions)
      } else if (routeOptions.config.rateLimit === false) {
        // don't apply any rate-limit
      } else {
        throw new Error('Unknown value for route rate-limit configuration')
      }
    } else if (globalParams.global) {
      // if the plugin is set globally ( meaning that all the route will be 'rate limited' )
      // As the endpoint, does not have a custom rateLimit configuration, use the global one.
      buildRouteRate(pluginComponent, globalParams, routeOptions)
    }
  })

  // Merge the parameters of a route with the global ones
  function makeParams (routeParams) {
    const result = Object.assign({}, globalParams, routeParams)
    if (typeof result.timeWindow === 'string') {
      result.timeWindow = ms(result.timeWindow)
    }
    return result
  }

  next()
}

function buildRouteRate (pluginComponent, params, routeOptions) {
  const after = ms(params.timeWindow, { long: true })

  if (Array.isArray(routeOptions.preHandler)) {
    routeOptions.preHandler.push(preHandler)
  } else if (typeof routeOptions.preHandler === 'function') {
    routeOptions.preHandler = [routeOptions.preHandler, preHandler]
  } else {
    routeOptions.preHandler = [preHandler]
  }

  // PreHandler function that will be use for current endpoint been processed
  function preHandler (req, res, next) {
    // We retrieve the key from the generator. (can be the global one, or the one define in the endpoint)
    const key = params.keyGenerator(req)

    // whitelist doesn't apply any rate limit
    if (pluginComponent.whitelist) {
      if (typeof pluginComponent.whitelist === 'function') {
        if (pluginComponent.whitelist(req, key)) {
          next()
          return
        }
      } else if (pluginComponent.whitelist.indexOf(key) > -1) {
        next()
        return
      }
    }

    // As the key is not whitelist in redis/lru, then we increment the rate-limit of the current request and we call the function "onIncr"
    pluginComponent.store.incr(key, onIncr)

    function onIncr (err, { current, ttl }) {
      if (err && params.skipOnError === false) {
        return next(err)
      }

      const maximum = getMax()
      if (current <= maximum) {
        res.header('x-ratelimit-limit', maximum)
          .header('x-ratelimit-remaining', maximum - current)
          .header('x-ratelimit-reset', Math.floor(ttl / 1000))

        if (typeof params.onExceeding === 'function') {
          params.onExceeding(req)
        }

        next()
      } else {
        if (typeof params.onExceeded === 'function') {
          params.onExceeded(req)
        }

        if (!params.isCustomErrorMessage) {
          res.type('application/json').serializer(serializeError)
        }

        if (params.addHeaders['x-ratelimit-limit']) { res.header('x-ratelimit-limit', maximum) }
        if (params.addHeaders['x-ratelimit-remaining']) { res.header('x-ratelimit-remaining', 0) }
        if (params.addHeaders['x-ratelimit-reset']) { res.header('x-ratelimit-reset', Math.floor(ttl / 1000)) }
        if (params.addHeaders['retry-after']) { res.header('retry-after', params.timeWindow) }

        const code = params.ban && current - maximum > params.ban ? 403 : 429
        res.code(code)

        const respCtx = {
          statusCode: code,
          after,
          max: maximum
        }

        if (code === 403) {
          respCtx.ban = true
        }
        res.send(params.errorResponseBuilder(req, respCtx))
      }

      function getMax () {
        if (typeof params.max === 'number') {
          return params.max
        } else {
          return params.max(req, key)
        }
      }
    }
  }
}

module.exports = fp(rateLimitPlugin, {
  fastify: '>=2.x',
  name: 'fastify-rate-limit'
})
