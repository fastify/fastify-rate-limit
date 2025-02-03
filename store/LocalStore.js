'use strict'

const { LruMap: Lru } = require('toad-cache')

function LocalStore (continueExceeding, exponentialBackoff, cache = 5000) {
  this.continueExceeding = continueExceeding
  this.exponentialBackoff = exponentialBackoff
  this.lru = new Lru(cache)
}

LocalStore.prototype.incr = function (ip, cb, timeWindow, max) {
  const nowInMs = Date.now()
  let current = this.lru.get(ip)

  if (!current) {
    // Item doesn't exist
    current = { current: 1, ttl: timeWindow, iterationStartMs: nowInMs }
  } else if (current.iterationStartMs + timeWindow <= nowInMs) {
    // Item has expired
    current.current = 1
    current.ttl = timeWindow
    current.iterationStartMs = nowInMs
  } else {
    // Item is alive
    ++current.current

    // Reset TLL if max has been exceeded and `continueExceeding` is enabled
    if (this.continueExceeding && current.current > max) {
      current.ttl = timeWindow
      current.iterationStartMs = nowInMs
    } else if (this.exponentialBackoff && current.current > max) {
      // Handle exponential backoff
      const backoffExponent = current.current - max - 1
      const ttl = timeWindow * (2 ** backoffExponent)
      current.ttl = Number.isSafeInteger(ttl) ? ttl : Number.MAX_SAFE_INTEGER
      current.iterationStartMs = nowInMs
    } else {
      current.ttl = timeWindow - (nowInMs - current.iterationStartMs)
    }
  }

  this.lru.set(ip, current)
  cb(null, current)
}

LocalStore.prototype.child = function (routeOptions) {
  return new LocalStore(routeOptions.continueExceeding, routeOptions.exponentialBackoff, routeOptions.cache)
}

module.exports = LocalStore
