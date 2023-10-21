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
    current = { current: 0, iterationStartMs: nowInMs, ttl: this.timeWindow }
  } else if (current.iterationStartMs + this.timeWindow <= nowInMs) {
    current.current = 0
    current.iterationStartMs = nowInMs
    current.ttl = this.timeWindow
  }

  ++current.current

  if (this.continueExceeding) {
    if (current.current > max) {
      current.iterationStartMs = nowInMs
    }

    this.lru.set(ip, current)
    cb(null, current)
  } else {
    this.lru.set(ip, current)
    current.ttl = this.timeWindow - (nowInMs - current.iterationStartMs)
    cb(null, current)
  }
}

LocalStore.prototype.child = function (routeOptions) {
  return new LocalStore(routeOptions.cache, routeOptions.timeWindow, routeOptions.continueExceeding)
}

module.exports = LocalStore
