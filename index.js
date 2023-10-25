'use strict'

const fp = require('fastify-plugin')
const ms = require('@lukeed/ms')

const LocalStore = require('./store/LocalStore')
const RedisStore = require('./store/RedisStore')

const defaultHook = 'onRequest'

const defaultHeaders = {
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

async function fastifyRateLimit (fastify, settings) {
  const globalParams = {
    global: (typeof settings.global === 'boolean') ? settings.global : true
  }

  if (typeof settings.enableDraftSpec === 'boolean' && settings.enableDraftSpec) {
    globalParams.enableDraftSpec = true
    globalParams.labels = draftSpecHeaders
  } else {
    globalParams.enableDraftSpec = false
    globalParams.labels = defaultHeaders
  }

  globalParams.addHeaders = Object.assign({
    [globalParams.labels.rateLimit]: true,
    [globalParams.labels.rateRemaining]: true,
    [globalParams.labels.rateReset]: true,
    [globalParams.labels.retryAfter]: true
  }, settings.addHeaders)

  globalParams.addHeadersOnExceeding = Object.assign({
    [globalParams.labels.rateLimit]: true,
    [globalParams.labels.rateRemaining]: true,
    [globalParams.labels.rateReset]: true
  }, settings.addHeadersOnExceeding)

  // Global maximum allowed requests
  globalParams.max = ((typeof settings.max === 'number' && !isNaN(settings.max)) || typeof settings.max === 'function')
    ? settings.max
    : 1000

  // Global time window
  globalParams.timeWindow = typeof settings.timeWindow === 'string'
    ? ms.parse(settings.timeWindow)
    : typeof settings.timeWindow === 'number' && !isNaN(settings.timeWindow)
      ? settings.timeWindow
      : 1000 * 60
  globalParams.timeWindowInSeconds = Math.floor(globalParams.timeWindow / 1000)

  globalParams.hook = settings.hook || defaultHook
  globalParams.allowList = settings.allowList || settings.whitelist || null
  globalParams.ban = settings.ban || 0 // 0 means turned off
  globalParams.onBanReach = typeof settings.onBanReach === 'function' ? settings.onBanReach : null
  globalParams.onExceeding = typeof settings.onExceeding === 'function' ? settings.onExceeding : null
  globalParams.onExceeded = typeof settings.onExceeded === 'function' ? settings.onExceeded : null
  globalParams.continueExceeding = typeof settings.continueExceeding === 'boolean' ? settings.continueExceeding : false

  globalParams.keyGenerator = typeof settings.keyGenerator === 'function'
    ? settings.keyGenerator
    : defaultKeyGenerator

  if (typeof settings.errorResponseBuilder === 'function') {
    globalParams.errorResponseBuilder = settings.errorResponseBuilder
    globalParams.isCustomErrorMessage = true
  } else {
    globalParams.errorResponseBuilder = defaultErrorResponse
    globalParams.isCustomErrorMessage = false
  }

  globalParams.skipOnError = typeof settings.skipOnError === 'boolean' ? settings.skipOnError : false

  const rateLimitRan = Symbol('fastify.request.rateLimitRan')
  const pluginComponent = {
    rateLimitRan,
    store: null
  }

  if (settings.store) {
    const Store = settings.store
    pluginComponent.store = new Store(globalParams)
  } else {
    if (settings.redis) {
      pluginComponent.store = new RedisStore(settings.redis, globalParams.timeWindow, settings.continueExceeding, settings.nameSpace || 'fastify-rate-limit-')
    } else {
      pluginComponent.store = new LocalStore(settings.cache, globalParams.timeWindow, settings.continueExceeding)
    }
  }

  fastify.decorateRequest(rateLimitRan, false)

  if (!fastify.hasDecorator('rateLimit')) {
    fastify.decorate('rateLimit', (options) => {
      if (typeof options === 'object') {
        const newPluginComponent = Object.create(pluginComponent)
        const mergedRateLimitParams = mergeParams(globalParams, options, { routeInfo: {} })
        newPluginComponent.store = newPluginComponent.store.child(mergedRateLimitParams)
        return rateLimitRequestHandler(newPluginComponent, mergedRateLimitParams)
      }

      return rateLimitRequestHandler(pluginComponent, globalParams)
    })
  }

  fastify.addHook('onRoute', (routeOptions) => {
    if (routeOptions.config?.rateLimit !== undefined) {
      if (typeof routeOptions.config.rateLimit === 'object') {
        const newPluginComponent = Object.create(pluginComponent)
        const mergedRateLimitParams = mergeParams(globalParams, routeOptions.config.rateLimit, { routeInfo: routeOptions })
        newPluginComponent.store = pluginComponent.store.child(mergedRateLimitParams)
        addRouteRateHook(newPluginComponent, mergedRateLimitParams, routeOptions)
      } else if (routeOptions.config.rateLimit !== false) {
        throw new Error('Unknown value for route rate-limit configuration')
      }
    } else if (globalParams.global) {
      // As the endpoint does not have a custom configuration, use the global one
      addRouteRateHook(pluginComponent, globalParams, routeOptions)
    }
  })
}

function mergeParams (...params) {
  const result = Object.assign({}, ...params)
  if (typeof result.timeWindow === 'string') {
    result.timeWindow = ms.parse(result.timeWindow)
  }
  if (typeof result.timeWindow === 'number' && !isNaN(result.timeWindow)) {
    result.timeWindowInSeconds = Math.floor(result.timeWindow / 1000)
  }
  return result
}

function addRouteRateHook (pluginComponent, params, routeOptions) {
  const hook = params.hook || defaultHook
  const hookHandler = rateLimitRequestHandler(pluginComponent, params)
  if (Array.isArray(routeOptions[hook])) {
    routeOptions[hook].push(hookHandler)
  } else if (typeof routeOptions[hook] === 'function') {
    routeOptions[hook] = [routeOptions[hook], hookHandler]
  } else {
    routeOptions[hook] = [hookHandler]
  }
}

function rateLimitRequestHandler (pluginComponent, params) {
  const { rateLimitRan, store } = pluginComponent

  return async (req, res) => {
    if (req[rateLimitRan]) {
      return
    }

    req[rateLimitRan] = true

    // Retrieve the key from the generator (the global one or the one defined in the endpoint)
    const key = await params.keyGenerator(req)

    // Don't apply any rate limiting if in the allow list
    if (params.allowList) {
      if (typeof params.allowList === 'function') {
        if (await params.allowList(req, key)) {
          return
        }
      } else if (params.allowList.indexOf(key) !== -1) {
        return
      }
    }

    const max = typeof params.max === 'number' && !isNaN(params.max) ? params.max : await params.max(req, key)
    let current = 0
    let ttl = 0
    let timeLeftInSeconds = 0

    // We increment the rate limit for the current request
    try {
      const res = await new Promise((resolve, reject) => {
        store.incr(key, (err, res) => {
          err ? reject(err) : resolve(res)
        }, max)
      })

      current = res.current
      ttl = res.ttl
    } catch (err) {
      if (!params.skipOnError) {
        throw err
      }
    }

    timeLeftInSeconds = Math.ceil(ttl / 1000)

    if (current <= max) {
      if (params.addHeadersOnExceeding[params.labels.rateLimit]) { res.header(params.labels.rateLimit, max) }
      if (params.addHeadersOnExceeding[params.labels.rateRemaining]) { res.header(params.labels.rateRemaining, max - current) }
      if (params.addHeadersOnExceeding[params.labels.rateReset]) { res.header(params.labels.rateReset, timeLeftInSeconds) }

      params.onExceeding?.(req, key)

      return
    }

    params.onExceeded?.(req, key)

    if (params.addHeaders[params.labels.rateLimit]) { res.header(params.labels.rateLimit, max) }
    if (params.addHeaders[params.labels.rateRemaining]) { res.header(params.labels.rateRemaining, 0) }
    if (params.addHeaders[params.labels.rateReset]) { res.header(params.labels.rateReset, timeLeftInSeconds) }
    if (params.addHeaders[params.labels.retryAfter]) { res.header(params.labels.retryAfter, timeLeftInSeconds) }

    const code = params.ban && current - max > params.ban ? 403 : 429
    const respCtx = {
      statusCode: code,
      ban: false,
      max,
      ttl,
      after: ms.format(params.timeWindow, true)
    }

    if (code === 403) {
      respCtx.ban = true
      params.onBanReach?.(req, key)
    }

    throw params.errorResponseBuilder(req, respCtx)
  }
}

function defaultKeyGenerator (req) { return req.ip }

function defaultErrorResponse (req, context) {
  const err = new Error(`Rate limit exceeded, retry in ${context.after}`)
  err.statusCode = context.statusCode
  return err
}

module.exports = fp(fastifyRateLimit, {
  fastify: '4.x',
  name: '@fastify/rate-limit'
})
module.exports.default = fastifyRateLimit
module.exports.fastifyRateLimit = fastifyRateLimit
