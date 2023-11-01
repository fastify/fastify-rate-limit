'use strict'

const { Lru } = require('toad-cache')

function LocalStore (cache = 5000, timeWindow, continueExceeding) {
  this.lru = new Lru(cache)
  this.timeWindow = timeWindow
  this.continueExceeding = continueExceeding
}

LocalStore.prototype.incr = function (ip, cb, max, ban) {
  const nowInMs = Date.now()
  let current = this.lru.get(ip)

  if (!current) {
    // Item doesn't exist
    current = { current: 1, iterationStartMs: nowInMs, ttl: this.timeWindow, ban: false }
  } else if (current.iterationStartMs + this.timeWindow <= nowInMs) {
    // Item has expired
    current.current = 1
    current.iterationStartMs = nowInMs
    current.ttl = this.timeWindow
    current.ban = false
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

  if (ban !== -1 && !current.ban && current.current - max > ban) {
    current.ban = true
  }

  this.lru.set(ip, current)
  cb(null, current)
}

LocalStore.prototype.child = function (routeOptions) {
  return new LocalStore(routeOptions.cache, routeOptions.timeWindow, routeOptions.continueExceeding)
}

module.exports = LocalStore
