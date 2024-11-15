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

  --Flag to determine if exponential backoff should be applied
  local exponentialBackoff = ARGV[4] == 'true'

  --Max safe integer
  local MAX_SAFE_INTEGER = (2^53) - 1

  -- Increment the key's value
  local current = redis.call('INCR', key)

  -- Check the TTL of the key
  local ttl = redis.call('PTTL', key)

  -- If the key is new or if its incremented value has exceeded the max value then set its TTL
  if ttl == -1 or (continueExceeding and current > max) then
    redis.call('PEXPIRE', key, timeWindow)
    ttl = timeWindow
  
  -- If the key is new or if its incremented value has exceeded the max value and exponential backoff is enabled then set its TTL
  elseif exponentialBackoff and current > max then
    local backoffExponent = current - max - 1
    ttl = math.min(timeWindow * (2.0 ^ backoffExponent), MAX_SAFE_INTEGER)
    redis.call('PEXPIRE', key, ttl)
  end

  return {current, ttl}
`

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
}

RedisStore.prototype.incr = function (ip, cb, timeWindow, max) {
  this.redis.rateLimit(this.key + ip, timeWindow, max, this.continueExceeding, this.exponentialBackoff, (err, result) => {
    err ? cb(err, null) : cb(null, { current: result[0], ttl: result[1] })
  })
}

RedisStore.prototype.child = function (routeOptions) {
  return new RedisStore(routeOptions.continueExceeding, routeOptions.exponentialBackoff, this.redis, `${this.key}${routeOptions.routeInfo.method}${routeOptions.routeInfo.url}-`)
}

module.exports = RedisStore
