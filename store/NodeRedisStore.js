'use strict'

/**
 * When using node-redis, you need to initialize the client with the rateLimit script like this:
 * ```js
 * const redis = createClient({
 *   scripts: {
 *     rateLimit: rateLimit.NodeRedisStore.rateLimitScript
 *   }
 * });
 * ```
 */

const { lua } = require('./RedisStore')
const { defineScript } = require('@redis/client')

const rateLimitScript = defineScript({
  NUMBER_OF_KEYS: 1,
  SCRIPT: lua,
  transformArguments (key, timeWindow, max, continueExceeding, exponentialBackoff) {
    return [key, timeWindow.toString(), max.toString(), continueExceeding.toString(), exponentialBackoff.toString()]
  },
  transformReply (reply) {
    return reply
  },
})

function NodeRedisStore (continueExceeding, exponentialBackoff, redis, key = 'fastify-rate-limit-') {
  this.continueExceeding = continueExceeding
  this.exponentialBackoff = exponentialBackoff
  this.redis = redis
  this.key = key
}

NodeRedisStore.prototype.incr = function (ip, cb, timeWindow, max) {
  this
    .redis
    .rateLimit(this.key + ip, timeWindow, max, this.continueExceeding, this.exponentialBackoff)
    .then(result => {
      cb(null, { current: result[0], ttl: result[1] })
    })
    .catch(err => {
      cb(err, null)
    })
}

NodeRedisStore.prototype.child = function (routeOptions) {
  return new NodeRedisStore(routeOptions.continueExceeding, routeOptions.exponentialBackoff, this.redis, `${this.key}${routeOptions.routeInfo.method}${routeOptions.routeInfo.url}-`)
}

module.exports = NodeRedisStore
module.exports.rateLimitScript = rateLimitScript
