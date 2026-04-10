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

let cachedScriptCtor = null
let cachedScript = null

function getScriptCtor () {
  if (ValkeyStore.Script) {
    return ValkeyStore.Script
  }

  try {
    return require('@valkey/valkey-glide').Script
  } catch (err) {
    err.message = 'Valkey support requires @valkey/valkey-glide to be installed'
    throw err
  }
}

function getRateLimitScript () {
  const Script = getScriptCtor()

  if (cachedScriptCtor !== Script || cachedScript === null) {
    cachedScriptCtor = Script
    cachedScript = new Script(lua)
  }

  return cachedScript
}

function ValkeyStore (continueExceeding, exponentialBackoff, valkey, key = 'fastify-rate-limit-') {
  this.continueExceeding = continueExceeding
  this.exponentialBackoff = exponentialBackoff
  this.valkey = valkey
  this.key = key
  this.script = getRateLimitScript()
}

ValkeyStore.prototype.incr = function (ip, cb, timeWindow, max) {
  this.valkey.invokeScript(this.script, {
    keys: [this.key + ip],
    args: [String(timeWindow), String(max), String(this.continueExceeding), String(this.exponentialBackoff)]
  }).then((result) => {
    cb(null, { current: Number(result[0]), ttl: Number(result[1]) })
  }, (err) => {
    cb(err, null)
  })
}

ValkeyStore.prototype.child = function (routeOptions) {
  return new ValkeyStore(routeOptions.continueExceeding, routeOptions.exponentialBackoff, this.valkey, `${this.key}${routeOptions.routeInfo.method}${routeOptions.routeInfo.url}-`)
}

ValkeyStore.Script = null

module.exports = ValkeyStore
