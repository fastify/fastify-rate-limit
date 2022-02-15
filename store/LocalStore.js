'use strict'

const lru = require('tiny-lru')

function LocalStore (timeWindow, cache, app, continueExceeding) {
  this.lru = lru(cache || 5000, timeWindow)
  this.app = app
  this.timeWindow = timeWindow
  this.continueExceeding = continueExceeding
}

LocalStore.prototype.incr = function (ip, cb) {
  const nowInMs = Date.now()
  const current = this.lru.get(ip) || { count: 0, iterationStartMs: nowInMs }

  current.count++

  this.lru.set(ip, current)

  if (this.continueExceeding) {
    cb(null, { current: current.count, ttl: this.timeWindow })
  } else {
    cb(null, { current: current.count, ttl: this.timeWindow - (nowInMs - current.iterationStartMs) })
  }
}

LocalStore.prototype.child = function (routeOptions) {
  return new LocalStore(routeOptions.timeWindow,
    routeOptions.cache, this.app, routeOptions.continueExceeding)
}

module.exports = LocalStore
