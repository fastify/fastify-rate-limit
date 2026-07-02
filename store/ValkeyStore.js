'use strict'

const lua = `
  local key = KEYS[1]
  local timeWindow = tonumber(ARGV[1])
  local max = tonumber(ARGV[2])
  local continueExceeding = ARGV[3] == 'true'
  local exponentialBackoff = ARGV[4] == 'true'
  local MAX_SAFE_INTEGER = (2^53) - 1
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

function ValkeyStore (continueExceeding, exponentialBackoff, valkey, key = 'fastify-rate-limit-') {
  this.continueExceeding = continueExceeding
  this.exponentialBackoff = exponentialBackoff
  this.valkey = valkey
  this.key = key
}

ValkeyStore.prototype.incr = function (ip, cb, timeWindow, max) {
  const args = ['EVAL', lua, '1', this.key + ip,
    String(timeWindow), String(max),
    String(this.continueExceeding), String(this.exponentialBackoff)]

  this.valkey.customCommand(args).then(
    (result) => cb(null, { current: Number(result[0]), ttl: Number(result[1]) }),
    (err) => cb(err, null)
  )
}

ValkeyStore.prototype.child = function (routeOptions) {
  return new ValkeyStore(
    routeOptions.continueExceeding,
    routeOptions.exponentialBackoff,
    this.valkey,
    `${this.key}${routeOptions.routeInfo.method}${routeOptions.routeInfo.url}-`
  )
}

module.exports = ValkeyStore
