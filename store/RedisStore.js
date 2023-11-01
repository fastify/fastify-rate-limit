'use strict'

const lua = `
  -- Key to operate on
  local key = KEYS[1]
  -- Time window for the TTL
  local timeWindow = tonumber(ARGV[1])
  -- Max requests
  local max = tonumber(ARGV[2])
  -- Ban after this number is exceeded
  local ban = tonumber(ARGV[3])
  -- Flag to determine if TTL should be reset after exceeding
  local continueExceeding = ARGV[4] == 'true'

  -- Increment the key's value
  local current = redis.call('INCR', key)

  -- Check the TTL of the key
  local ttl = redis.call('PTTL', key)

  -- If the key is new or if its incremented value has exceeded the max value then set its TTL
  if ttl == -1 or (continueExceeding and current > max) then
    redis.call('PEXPIRE', key, timeWindow)
    ttl = timeWindow
  end

  return {current, ttl, ban ~= -1 and current - max > ban}
`

function RedisStore (redis, timeWindow, continueExceeding, key) {
  this.redis = redis
  this.timeWindow = timeWindow
  this.continueExceeding = continueExceeding
  this.key = key

  if (!this.redis.rateLimit) {
    this.redis.defineCommand('rateLimit', {
      numberOfKeys: 1,
      lua
    })
  }
}

RedisStore.prototype.incr = function (ip, cb, max, ban) {
  this.redis.rateLimit(this.key + ip, this.timeWindow, max, ban, this.continueExceeding, (err, result) => {
    err ? cb(err, null) : cb(null, { current: result[0], ttl: result[1], ban: result[2] })
  })
}

RedisStore.prototype.child = function (routeOptions) {
  return new RedisStore(this.redis, routeOptions.timeWindow, routeOptions.continueExceeding, this.key + routeOptions.routeInfo.method + routeOptions.routeInfo.url + '-')
}

module.exports = RedisStore
