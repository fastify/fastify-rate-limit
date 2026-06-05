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

  if current == 1 or (continueExceeding and current > max) then
    redis.call('PEXPIRE', key, timeWindow)
  elseif exponentialBackoff and current > max then
    local backoffExponent = current - max - 1
    timeWindow = math.min(timeWindow * (2 ^ backoffExponent), MAX_SAFE_INTEGER)
    redis.call('PEXPIRE', key, timeWindow)
  else
    timeWindow = redis.call('PTTL', key)
  end

  return {current, timeWindow}
`

const luaRead = `
  -- Key to operate on
  local key = KEYS[1]

  -- Read the counter without mutating it
  local current = redis.call('GET', key)

  if current == false then
    -- Key doesn't exist: clean state
    return {0, 0}
  end

  -- Read the remaining TTL in milliseconds
  local ttl = redis.call('PTTL', key)
  if ttl < 0 then
    -- -2 (no key) or -1 (no expiry): report no active window
    ttl = 0
  end

  return {tonumber(current), ttl}
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

RedisStore.prototype.read = function (ip, cb) {
  this.redis.rateLimitRead(this.key + ip, (err, result) => {
    err ? cb(err, null) : cb(null, { current: result[0], ttl: result[1] })
  })
}

RedisStore.prototype.child = function (routeOptions) {
  return new RedisStore(routeOptions.continueExceeding, routeOptions.exponentialBackoff, this.redis, `${this.key}${routeOptions.routeInfo.method}${routeOptions.routeInfo.url}-`)
}

module.exports = RedisStore
