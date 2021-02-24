'use strict'

const fp = require('fastify-plugin')
const ms = require('ms')

const LocalStore = require('./store/LocalStore')
const RedisStore = require('./store/RedisStore')

let labels = {
  rateLimit: 'x-ratelimit-limit',
  rateRemaining: 'x-ratelimit-remaining',
  rateReset: 'x-ratelimit-reset',
  retryAfter: 'retry-after'
}

const draftSpecHeaders = {
  rateLimit: 'ratelimit-limit',
  rateRemaining: 'ratelimit-remaining',
  rateReset: 'ratelimit-reset',
  retryAfter: 'retry-after'
}

async function rateLimitPlugin (fastify, settings) {
  // create the object that will hold the "main" settings that can be shared during the build
  // 'global' will define, if the rate limit should be apply by default on all route. default : true
  const globalParams = {
    global: (typeof settings.global === 'boolean') ? settings.global : true
  }

  if (typeof settings.enableDraftSpec === 'boolean' && settings.enableDraftSpec) {
    globalParams.enableDraftSpec = true
    labels = draftSpecHeaders
  }

  globalParams.addHeaders = Object.assign({
    [labels.rateLimit]: true,
    [labels.rateRemaining]: true,
    [labels.rateReset]: true,
    [labels.retryAfter]: true
  }, settings.addHeaders)

  globalParams.labels = labels

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

  globalParams.allowList = settings.allowList || settings.whitelist || null
  globalParams.ban = settings.ban || null

  // define the name of the app component. Related to redis, it will be use as a part of the keyname define in redis.
  const pluginComponent = {
    allowList: globalParams.allowList
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
    : (req) => req.ip

  globalParams.errorResponseBuilder = defaultErrorResponse
  globalParams.isCustomErrorMessage = false

  // define if error message was overwritten with a custom error response callback
  if (typeof settings.errorResponseBuilder === 'function') {
    globalParams.errorResponseBuilder = settings.errorResponseBuilder
    globalParams.isCustomErrorMessage = true
  }

  // onRoute add the onRequest rate-limit function if needed
  fastify.addHook('onRoute', (routeOptions) => {
    if (routeOptions.config && typeof routeOptions.config.rateLimit !== 'undefined') {
      if (typeof routeOptions.config.rateLimit === 'object') {
        const current = Object.create(pluginComponent)
        const mergedRateLimitParams = makeParams(routeOptions.config.rateLimit)
        mergedRateLimitParams.routeInfo = routeOptions
        current.store = pluginComponent.store.child(mergedRateLimitParams)
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
}

async function buildRouteRate (pluginComponent, params, routeOptions) {
  const after = ms(params.timeWindow, { long: true })

  if (Array.isArray(routeOptions.onRequest)) {
    routeOptions.onRequest.push(onRequest)
  } else if (typeof routeOptions.onRequest === 'function') {
    routeOptions.onRequest = [routeOptions.onRequest, onRequest]
  } else {
    routeOptions.onRequest = [onRequest]
  }

  // onRequest function that will be use for current endpoint been processed
  function onRequest (req, res, next) {
    // We retrieve the key from the generator. (can be the global one, or the one define in the endpoint)
    const key = params.keyGenerator(req)

    // allowList doesn't apply any rate limit
    if (pluginComponent.allowList) {
      if (typeof pluginComponent.allowList === 'function') {
        if (pluginComponent.allowList(req, key)) {
          next()
          return
        }
      } else if (pluginComponent.allowList.indexOf(key) > -1) {
        next()
        return
      }
    }

    // As the key is not allowList in redis/lru, then we increment the rate-limit of the current request and we call the function "onIncr"
    pluginComponent.store.incr(key, onIncr)

    async function onIncr (err, { current, ttl }) {
      if (err && params.skipOnError === false) {
        return next(err)
      }

      const maximum = await getMax()
      const timeLeft = Math.floor(ttl / 1000)

      if (current <= maximum) {
        res.header(params.labels.rateLimit, maximum)
          .header(params.labels.rateRemaining, maximum - current)
          .header(params.labels.rateReset, timeLeft)

        if (typeof params.onExceeding === 'function') {
          params.onExceeding(req)
        }

        next()
      } else {
        if (typeof params.onExceeded === 'function') {
          params.onExceeded(req)
        }

        if (params.addHeaders[params.labels.rateLimit]) { res.header(params.labels.rateLimit, maximum) }
        if (params.addHeaders[params.labels.rateRemaining]) { res.header(params.labels.rateRemaining, 0) }
        if (params.addHeaders[params.labels.rateReset]) { res.header(params.labels.rateReset, timeLeft) }
        if (params.addHeaders[params.labels.retryAfter]) {
          const resetAfterTime = (params.enableDraftSpec) ? timeLeft : params.timeWindow
          res.header(params.labels.retryAfter, resetAfterTime)
        }

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

      async function getMax () {
        if (typeof params.max === 'number') {
          return params.max
        } else {
          return await params.max(req, key)
        }
      }
    }
  }
}

function defaultErrorResponse (req, context) {
  const err = new Error(`Rate limit exceeded, retry in ${context.after}`)
  err.statusCode = context.statusCode
  return err
}

module.exports = fp(rateLimitPlugin, {
  fastify: '2.x - 3.x',
  name: 'fastify-rate-limit'
})
