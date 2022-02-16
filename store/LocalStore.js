'use strict'

const lru = require('tiny-lru')

function LocalStore (timeWindow, cache, app, continueExceeding) {
  this.lru = lru(cache || 5000, timeWindow)
  this.app = app
  this.timeWindow = timeWindow
  this.continueExceeding = continueExceeding
}

LocalStore.prototype.incr = function (ip, cb, max) {
  const nowInMs = Date.now()
  const current = this.lru.get(ip) || { count: 0, iterationStartMs: nowInMs }

  current.count++

  if (this.continueExceeding) {
    if (current.count > max) {
      this.lru.delete(ip)
    }

    // It will recalculate the TTL if the item is missing - count exceeded the maximum
    this.lru.set(ip, current)
    cb(null, { current: current.count, ttl: this.timeWindow })
  } else {
    this.lru.set(ip, current)
    cb(null, { current: current.count, ttl: this.timeWindow - (nowInMs - current.iterationStartMs) })
  }
}

LocalStore.prototype.child = function (routeOptions) {
  return new LocalStore(routeOptions.timeWindow,
    routeOptions.cache, this.app, routeOptions.continueExceeding)
}

module.exports = LocalStore
