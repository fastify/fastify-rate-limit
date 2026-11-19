'use strict'

const crypto = require('node:crypto')

const { lua, luaRead } = require('./RedisStore')

// EVALSHA addresses scripts by the SHA1 of their source, so the digests can
// be computed locally and used right away; the first call falls back to EVAL
// (which also populates the server's script cache) when the script is not
// cached yet.
const luaSha = crypto.createHash('sha1').update(lua).digest('hex')
const luaReadSha = crypto.createHash('sha1').update(luaRead).digest('hex')

function NodeRedisStore (continueExceeding, exponentialBackoff, redis, key = 'fastify-rate-limit-') {
  this.continueExceeding = continueExceeding
  this.exponentialBackoff = exponentialBackoff
  this.redis = redis
  this.key = key
}

function execScript (redis, sha, script, keys, args, cb) {
  const onResult = (result) => cb(null, { current: result[0], ttl: result[1] })

  redis.evalSha(sha, { keys, arguments: args }).then(onResult, (err) => {
    if (typeof err?.message === 'string' && err.message.includes('NOSCRIPT')) {
      redis.eval(script, { keys, arguments: args }).then(onResult, (err) => cb(err, null))
    } else {
      cb(err, null)
    }
  })
}

NodeRedisStore.prototype.incr = function (ip, cb, timeWindow, max) {
  // node-redis requires script arguments to be strings
  execScript(this.redis, luaSha, lua, [this.key + ip], [String(timeWindow), String(max), String(this.continueExceeding), String(this.exponentialBackoff)], cb)
}

/**
 * Read the current rate-limit state for `ip` without mutating it.
 *
 * Same contract as `RedisStore.prototype.read`: `timeWindow`/`max` are
 * accepted for signature parity but ignored, and the reported `ttl` is the
 * raw server `PTTL`.
 *
 * @param {string} ip
 * @param {(err: Error | null, res: { current: number, ttl: number }) => void} cb
 * @param {number} [timeWindow]
 * @param {number} [max]
 */
NodeRedisStore.prototype.read = function (ip, cb, timeWindow, max) {
  execScript(this.redis, luaReadSha, luaRead, [this.key + ip], [], cb)
}

NodeRedisStore.prototype.child = function (routeOptions) {
  return new NodeRedisStore(routeOptions.continueExceeding, routeOptions.exponentialBackoff, this.redis, `${this.key}${routeOptions.routeInfo.method}${routeOptions.routeInfo.url}-`)
}

module.exports = NodeRedisStore
