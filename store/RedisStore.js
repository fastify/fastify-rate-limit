'use strict'

const { increment: lua, read: luaRead } = require('./lua')

function RedisStore (continueExceeding, exponentialBackoff, redis, key = 'fastify-rate-limit-') {
  this.continueExceeding = continueExceeding
  this.exponentialBackoff = exponentialBackoff
  this.redis = redis
  this.key = key

  if (!this.redis.rateLimit) {
    this.redis.defineCommand('rateLimit', {
      numberOfKeys: 1,
      lua
    })
  }

  if (!this.redis.rateLimitRead) {
    this.redis.defineCommand('rateLimitRead', {
      numberOfKeys: 1,
      lua: luaRead
    })
  }
}

RedisStore.prototype.incr = function (ip, cb, timeWindow, max) {
  this.redis.rateLimit(this.key + ip, timeWindow, max, this.continueExceeding, this.exponentialBackoff, (err, result) => {
    err ? cb(err, null) : cb(null, { current: result[0], ttl: result[1] })
  })
}

/**
 * Read the current rate-limit state for `ip` without mutating it.
 *
 * Same argument contract as `incr` (`ip, cb, timeWindow, max`); the Redis
 * implementation only needs the key, so `timeWindow`/`max` are ignored. The
 * reported `ttl` is the raw server `PTTL` — the same source `incr` returns on
 * its alive path — so it may exceed the configured `timeWindow` when
 * `continueExceeding`/`exponentialBackoff` extended it.
 *
 * @param {string} ip
 * @param {(err: Error | null, res: { current: number, ttl: number }) => void} cb
 * @param {number} [timeWindow]
 * @param {number} [max]
 */
RedisStore.prototype.read = function (ip, cb, timeWindow, max) {
  this.redis.rateLimitRead(this.key + ip, (err, result) => {
    err ? cb(err, null) : cb(null, { current: result[0], ttl: result[1] })
  })
}

RedisStore.prototype.child = function (routeOptions) {
  return new RedisStore(routeOptions.continueExceeding, routeOptions.exponentialBackoff, this.redis, `${this.key}${routeOptions.routeInfo.method}${routeOptions.routeInfo.url}-`)
}

module.exports = RedisStore
