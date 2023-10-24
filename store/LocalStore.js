'use strict'

const { Lru } = require('toad-cache')

function LocalStore (cache = 5000, timeWindow, continueExceeding) {
  this.lru = new Lru(cache)
  this.timeWindow = timeWindow
  this.continueExceeding = continueExceeding
}

LocalStore.prototype.incr = function (ip, cb, max) {
  const nowInMs = Date.now()
  let current = this.lru.get(ip)

  if (current === undefined) {
    // Item doesn't exist
    current = { current: 1, iterationStartMs: nowInMs, ttl: this.timeWindow }
  } else if (current.iterationStartMs + this.timeWindow <= nowInMs) {
    // Item has expired
    current.current = 1
    current.iterationStartMs = nowInMs
    current.ttl = this.timeWindow
  } else {
    // Item is alive
    ++current.current

    // Reset TLL if max has been exceeded and `continueExceeding` is enabled
    if (this.continueExceeding && current.current > max) {
      current.iterationStartMs = nowInMs
      current.ttl = this.timeWindow
    } else {
      current.ttl = this.timeWindow - (nowInMs - current.iterationStartMs)
    }
  }

  this.lru.set(ip, current)
  cb(null, current)
}

LocalStore.prototype.child = function (routeOptions) {
  return new LocalStore(routeOptions.cache, routeOptions.timeWindow, routeOptions.continueExceeding)
}

module.exports = LocalStore
