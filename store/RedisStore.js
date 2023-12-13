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
  if ttl == -1 or (continueExceeding == true and current > max) then
    ttl = timeWindow
    redis.call('PEXPIRE', key, timeWindow)
  end

  return {current, ttl}
`

function RedisStore (redis, timeWindow, continueExceeding, key) {
  this.redis = redis
  this.timeWindow = timeWindow
  this.continueExceeding = continueExceeding
  this.key = key

  if (this.redis.rateLimit === undefined) {
    this.redis.defineCommand('rateLimit', {
      numberOfKeys: 1,
      lua
    })
  }
}

RedisStore.prototype.incr = function (ip, cb, max) {
  this.redis.rateLimit(this.key + ip, this.timeWindow, max, this.continueExceeding, (err, result) => {
    err == null ? cb(null, { current: result[0], ttl: result[1] }) : cb(err, null)
  })
}

RedisStore.prototype.child = function (routeOptions) {
  return new RedisStore(this.redis, routeOptions.timeWindow, routeOptions.continueExceeding, this.key + routeOptions.routeInfo.method + routeOptions.routeInfo.url + '-')
}

module.exports = RedisStore
