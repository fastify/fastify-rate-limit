'use strict'

const fp = require('fastify-plugin')
const ms = require('@lukeed/ms')

const LocalStore = require('./store/LocalStore')
const RedisStore = require('./store/RedisStore')

const defaultMax = 1000
const defaultTimeWindow = 60000
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

const defaultOnFn = () => {}

const defaultKeyGenerator = (req) => req.ip

const defaultErrorResponse = (req, context) => {
  const err = new Error(`Rate limit exceeded, retry in ${context.after}`)
  err.statusCode = context.statusCode
  return err
}

const areHeadersMatching = (customHeaders) => {
  for (const key in defaultHeaders) {
    // Check if key exists in targetObj
    if (!(key in customHeaders)) {
      return false
    }
    // Check if value types are the same
    if (typeof defaultHeaders[key] !== typeof customHeaders[key]) {
      return false
    }
  }

  return true
}

const getMergedHeaders = (customHeaders) => {
  const mergedHeaders = {}

  for (const key in defaultHeaders) {
    // If the key exists in obj1 and the type matches with obj2, use the value from obj2 if available, otherwise use the value from obj1
    if (key in customHeaders && typeof defaultHeaders[key] === typeof customHeaders[key]) {
      mergedHeaders[key] = customHeaders[key]
    } else {
      mergedHeaders[key] = defaultHeaders[key]
    }
  }

  return mergedHeaders
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
    if (settings.defaultHeaders && typeof settings.defaultHeaders === 'object' && areHeadersMatching(settings.defaultHeaders)) {
      globalParams.labels = getMergedHeaders(settings.defaultHeaders)
    } else globalParams.labels = defaultHeaders
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
  if (Number.isFinite(settings.max) && settings.max >= 0) {
    globalParams.max = Math.trunc(settings.max)
  } else if (
    typeof settings.max === 'function'
  ) {
    globalParams.max = settings.max
  } else {
    globalParams.max = defaultMax
  }

  // Global time window
  if (Number.isFinite(settings.timeWindow) && settings.timeWindow >= 0) {
    globalParams.timeWindow = Math.trunc(settings.timeWindow)
  } else if (typeof settings.timeWindow === 'string') {
    globalParams.timeWindow = ms.parse(settings.timeWindow)
  } else if (
    typeof settings.timeWindow === 'function'
  ) {
    globalParams.timeWindow = settings.timeWindow
  } else {
    globalParams.timeWindow = defaultTimeWindow
  }

  globalParams.hook = settings.hook || defaultHook
  globalParams.allowList = settings.allowList || settings.whitelist || null
  globalParams.ban = Number.isFinite(settings.ban) && settings.ban >= 0 ? Math.trunc(settings.ban) : -1
  globalParams.onBanReach = typeof settings.onBanReach === 'function' ? settings.onBanReach : defaultOnFn
  globalParams.onExceeding = typeof settings.onExceeding === 'function' ? settings.onExceeding : defaultOnFn
  globalParams.onExceeded = typeof settings.onExceeded === 'function' ? settings.onExceeded : defaultOnFn
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

  const pluginComponent = {
    rateLimitRan: Symbol('fastify.request.rateLimitRan'),
    store: null
  }

  if (settings.store) {
    const Store = settings.store
    pluginComponent.store = new Store(globalParams)
  } else {
    if (settings.redis) {
      pluginComponent.store = new RedisStore(globalParams.continueExceeding, settings.redis, settings.nameSpace)
    } else {
      pluginComponent.store = new LocalStore(globalParams.continueExceeding, settings.cache)
    }
  }

  fastify.decorateRequest(pluginComponent.rateLimitRan, false)

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
    if (routeOptions.config?.rateLimit != null) {
      if (typeof routeOptions.config.rateLimit === 'object') {
        const newPluginComponent = Object.create(pluginComponent)
        const mergedRateLimitParams = mergeParams(globalParams, routeOptions.config.rateLimit, { routeInfo: routeOptions })
        newPluginComponent.store = pluginComponent.store.child(mergedRateLimitParams)

        if (routeOptions.config.rateLimit.groupId) {
          if (typeof routeOptions.config.rateLimit.groupId !== 'string') {
            throw new Error('groupId must be a string')
          }

          addRouteRateHook(pluginComponent, globalParams, routeOptions)
        } else {
          addRouteRateHook(newPluginComponent, mergedRateLimitParams, routeOptions)
        }
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

  if (Number.isFinite(result.timeWindow) && result.timeWindow >= 0) {
    result.timeWindow = Math.trunc(result.timeWindow)
  } else if (typeof result.timeWindow === 'string') {
    result.timeWindow = ms.parse(result.timeWindow)
  } else if (typeof result.timeWindow !== 'function') {
    result.timeWindow = defaultTimeWindow
  }

  if (Number.isFinite(result.max) && result.max >= 0) {
    result.max = Math.trunc(result.max)
  } else if (typeof result.max !== 'function') {
    result.max = defaultMax
  }

  if (Number.isFinite(result.ban) && result.ban >= 0) {
    result.ban = Math.trunc(result.ban)
  } else {
    result.ban = -1
  }

  return result
}

function addRouteRateHook (pluginComponent, params, routeOptions) {
  const hook = params.hook
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

  let timeWindowString
  if (typeof params.timeWindow === 'number') {
    timeWindowString = ms.format(params.timeWindow, true)
  }

  return async (req, res) => {
    if (req[rateLimitRan]) {
      return
    }

    req[rateLimitRan] = true

    // Retrieve the key from the generator (the global one or the one defined in the endpoint)
    let key = await params.keyGenerator(req)
    const groupId = req.routeOptions.config?.rateLimit?.groupId

    if (groupId) {
      key += groupId
    }

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

    const max = typeof params.max === 'number' ? params.max : await params.max(req, key)
    const timeWindow = typeof params.timeWindow === 'number' ? params.timeWindow : await params.timeWindow(req, key)
    let current = 0
    let ttl = 0
    let ttlInSeconds = 0

    // We increment the rate limit for the current request
    try {
      const res = await new Promise((resolve, reject) => {
        store.incr(key, (err, res) => {
          err ? reject(err) : resolve(res)
        }, timeWindow, max)
      })

      current = res.current
      ttl = res.ttl
      ttlInSeconds = Math.ceil(res.ttl / 1000)
    } catch (err) {
      if (!params.skipOnError) {
        throw err
      }
    }

    if (current <= max) {
      if (params.addHeadersOnExceeding[params.labels.rateLimit]) { res.header(params.labels.rateLimit, max) }
      if (params.addHeadersOnExceeding[params.labels.rateRemaining]) { res.header(params.labels.rateRemaining, max - current) }
      if (params.addHeadersOnExceeding[params.labels.rateReset]) { res.header(params.labels.rateReset, ttlInSeconds) }

      params.onExceeding(req, key)

      return
    }

    params.onExceeded(req, key)

    if (params.addHeaders[params.labels.rateLimit]) { res.header(params.labels.rateLimit, max) }
    if (params.addHeaders[params.labels.rateRemaining]) { res.header(params.labels.rateRemaining, 0) }
    if (params.addHeaders[params.labels.rateReset]) { res.header(params.labels.rateReset, ttlInSeconds) }
    if (params.addHeaders[params.labels.retryAfter]) { res.header(params.labels.retryAfter, ttlInSeconds) }

    const respCtx = {
      statusCode: 429,
      ban: false,
      max,
      ttl,
      after: timeWindowString ?? ms.format(timeWindow, true)
    }

    if (params.ban !== -1 && current - max > params.ban) {
      respCtx.statusCode = 403
      respCtx.ban = true
      params.onBanReach(req, key)
    }

    throw params.errorResponseBuilder(req, respCtx)
  }
}

module.exports = fp(fastifyRateLimit, {
  fastify: '5.x',
  name: '@fastify/rate-limit'
})
module.exports.default = fastifyRateLimit
module.exports.fastifyRateLimit = fastifyRateLimit
