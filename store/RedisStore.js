'use strict'

const luaBasic = `
  -- Key to operate on
  local key = KEYS[1]
  -- Time window for the TTL
  local timeWindow = tonumber(ARGV[1])

  -- Increment the key's value
  local value = redis.call('INCR', key)

  -- Check the current TTL of the key
  local ttl = redis.call('TTL', key)

  -- If the key is new then set its TTL
  if ttl == -1 then
      redis.call('PEXPIRE', key, timeWindow)
      return {1, timeWindow}
  end

  return {value, ttl}
`

const luaContinueExceeding = `
  -- Key to operate on
  local key = KEYS[1]
  -- Time window for the TTL
  local timeWindow = tonumber(ARGV[1])
  -- Max allowed value
  local max = tonumber(ARGV[2])

  -- Increment the key's value
  local value = redis.call('INCR', key)

  -- Check the current TTL of the key
  local ttl = redis.call('TTL', key)

  -- If the key is new then set its TTL
  if ttl == -1 then
      redis.call('PEXPIRE', key, timeWindow)
      return {1, timeWindow}
  -- If the key's incremented value has exceeded the max value, then reset its TTL
  elseif value > max then
      redis.call('PEXPIRE', key, timeWindow)
      return {value, timeWindow}
  end

  return {value, ttl}
`

function RedisStore (redis, timeWindow, continueExceeding, key) {
  this.redis = redis
  this.redis.defineCommand('rateLimit', {
    numberOfKeys: 1,
    lua: continueExceeding ? luaContinueExceeding : luaBasic
  })
  this.timeWindow = timeWindow
  this.continueExceeding = continueExceeding
  this.key = key
}

RedisStore.prototype.incr = function (ip, cb, max) {
  const key = this.key + ip

  this.redis.rateLimit(key, this.timeWindow, max, (err, result) => {
    err ? cb(err, null) : cb(null, { current: result[0], ttl: result[1] })
  })
}

RedisStore.prototype.child = function (routeOptions) {
  return new RedisStore(this.redis, routeOptions.timeWindow, routeOptions.continueExceeding, this.key + routeOptions.routeInfo.method + routeOptions.routeInfo.url + '-')
}

module.exports = RedisStore
