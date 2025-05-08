'use strict'

const fp = require('fastify-plugin')
const { parse, format } = require('@lukeed/ms')

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

const defaultErrorResponse = (_req, context) => {
  const err = new Error(`Rate limit exceeded, retry in ${context.after}`)
  err.statusCode = context.statusCode
  return err
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
    globalParams.timeWindow = parse(settings.timeWindow)
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
  globalParams.exponentialBackoff = typeof settings.exponentialBackoff === 'boolean' ? settings.exponentialBackoff : false

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
      pluginComponent.store = new RedisStore(globalParams.continueExceeding, globalParams.exponentialBackoff, settings.redis, settings.nameSpace)
    } else {
      pluginComponent.store = new LocalStore(globalParams.continueExceeding, globalParams.exponentialBackoff, settings.cache)
    }
  }

  fastify.decorateRequest(pluginComponent.rateLimitRan, false)

  if (!fastify.hasDecorator('createRateLimit')) {
    fastify.decorate('createRateLimit', (options) => {
      const args = createLimiterArgs(pluginComponent, globalParams, options)
      return (req) => applyRateLimit.apply(this, args.concat(req))
    })
  }

  if (!fastify.hasDecorator('rateLimit')) {
    fastify.decorate('rateLimit', (options) => {
      const args = createLimiterArgs(pluginComponent, globalParams, options)
      return rateLimitRequestHandler(...args)
    })
  }

  fastify.addHook('onRoute', (routeOptions) => {
    if (routeOptions.config?.rateLimit != null) {
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

  if (Number.isFinite(result.timeWindow) && result.timeWindow >= 0) {
    result.timeWindow = Math.trunc(result.timeWindow)
  } else if (typeof result.timeWindow === 'string') {
    result.timeWindow = parse(result.timeWindow)
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

  if (result.groupId !== undefined && typeof result.groupId !== 'string') {
    throw new Error('groupId must be a string')
  }

  return result
}

function createLimiterArgs (pluginComponent, globalParams, options) {
  if (typeof options === 'object') {
    const newPluginComponent = Object.create(pluginComponent)
    const mergedRateLimitParams = mergeParams(globalParams, options, { routeInfo: {} })
    newPluginComponent.store = newPluginComponent.store.child(mergedRateLimitParams)
    return [newPluginComponent, mergedRateLimitParams]
  }

  return [pluginComponent, globalParams]
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

async function applyRateLimit (pluginComponent, params, req) {
  const { store } = pluginComponent

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
        return {
          isAllowed: true,
          key
        }
      }
    } else if (params.allowList.indexOf(key) !== -1) {
      return {
        isAllowed: true,
        key
      }
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

  return {
    isAllowed: false,
    key,
    max,
    timeWindow,
    remaining: Math.max(0, max - current),
    ttl,
    ttlInSeconds,
    isExceeded: current > max,
    isBanned: params.ban !== -1 && current - max > params.ban
  }
}

function rateLimitRequestHandler (pluginComponent, params) {
  const { rateLimitRan } = pluginComponent

  return async (req, res) => {
    if (req[rateLimitRan]) {
      return
    }

    req[rateLimitRan] = true

    const rateLimit = await applyRateLimit(pluginComponent, params, req)
    if (rateLimit.isAllowed) {
      return
    }

    const {
      key,
      max,
      remaining,
      ttl,
      ttlInSeconds,
      isExceeded,
      isBanned
    } = rateLimit

    if (!isExceeded) {
      if (params.addHeadersOnExceeding[params.labels.rateLimit]) { res.header(params.labels.rateLimit, max) }
      if (params.addHeadersOnExceeding[params.labels.rateRemaining]) { res.header(params.labels.rateRemaining, remaining) }
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
      after: format(ttlInSeconds * 1000, true)
    }

    if (isBanned) {
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
