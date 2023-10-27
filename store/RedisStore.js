'use strict'

const lua = `
  -- Key to operate on
  local key = KEYS[1]
  -- Time window for the TTL
  local timeWindow = tonumber(ARGV[1])
  -- Max allowed value
  local max = tonumber(ARGV[2])
  -- Flag to determine if TTL should be reset upon exceeding max
  local continueExceeding = ARGV[3] == 'true'

  -- Increment the key's value
  local value = redis.call('INCR', key)

  -- Check the current TTL of the key
  local ttl = redis.call('PTTL', key)

  -- If the key is new then set its TTL
  if ttl == -1 then
      redis.call('PEXPIRE', key, timeWindow)
      return {1, timeWindow}
  -- If the key's incremented value has exceeded the max value, then reset its TTL
  elseif continueExceeding and value > max then
      redis.call('PEXPIRE', key, timeWindow)
      return {value, timeWindow}
  end

  return {value, ttl}
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

RedisStore.prototype.incr = function (ip, cb, max) {
  this.redis.rateLimit(this.key + ip, this.timeWindow, max, this.continueExceeding, (err, result) => {
    err ? cb(err, null) : cb(null, { current: result[0], ttl: result[1] })
  })
}

RedisStore.prototype.child = function (routeOptions) {
  return new RedisStore(this.redis, routeOptions.timeWindow, routeOptions.continueExceeding, this.key + routeOptions.routeInfo.method + routeOptions.routeInfo.url + '-')
}

module.exports = RedisStore
