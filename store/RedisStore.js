'use strict'

const lua = `
  -- Key to operate on
  local key = KEYS[1]
  -- Time window for the TTL
  local timeWindow = tonumber(ARGV[1])
  -- Max requests
  local max = tonumber(ARGV[2])
  -- Flag to determine if TTL should be reset after exceeding
  local continueExceeding = ARGV[3] == 'true'

  -- Increment the key's value
  local current = redis.call('INCR', key)

  -- Check the TTL of the key
  local ttl = redis.call('PTTL', key)

  -- If the key is new or if its incremented value has exceeded the max value then set its TTL
  if ttl == -1 or (continueExceeding and current > max) then
    redis.call('PEXPIRE', key, timeWindow)
    ttl = timeWindow
  end

  return {current, ttl}
`

function RedisStore (continueExceeding, redis, key = 'fastify-rate-limit-') {
  this.continueExceeding = continueExceeding
  this.redis = redis
  this.key = key

  if (!this.redis.rateLimit) {
    this.redis.defineCommand('rateLimit', {
      numberOfKeys: 1,
      lua
    })
  }
}

RedisStore.prototype.incr = function (ip, cb, timeWindow, max) {
  this.redis.rateLimit(this.key + ip, timeWindow, max, this.continueExceeding, (err, result) => {
    err ? cb(err, null) : cb(null, { current: result[0], ttl: result[1] })
  })
}

RedisStore.prototype.child = function (routeOptions) {
  return new RedisStore(routeOptions.continueExceeding, this.redis, `${this.key}${routeOptions.routeInfo.method}${routeOptions.routeInfo.url}-`)
}

module.exports = RedisStore
