'use strict'

const lru = require('tiny-lru')

function LocalStore (timeWindow, cache, app, continueExceeding) {
  this.lru = lru(cache || 5000, timeWindow)
  this.app = app
  this.timeWindow = timeWindow
  this.continueExceeding = continueExceeding
}

LocalStore.prototype.incr = function (ip, cb) {
  const current = this.lru.get(ip) || { count: 0, iterationStartMs: Date.now() }
  const isNewItem = current.count === 0

  current.count++

  // We want to update the TTL only if it's a new item (because it doesn't have any TTL) or `continueExceeding` is true
  // Passing false to the 3rd parameter = update the TTL AND I don't know if the item with that key already exist
  // Passing true means don't update the TTL AND I'm sure there is an item with that key
  this.lru.set(ip, current, !(isNewItem || this.continueExceeding))

  if (this.continueExceeding) {
    cb(null, { current: current.count, ttl: this.timeWindow })
  } else {
    cb(null, { current: current.count, ttl: this.timeWindow - (Date.now() - current.iterationStartMs) })
  }
}

LocalStore.prototype.child = function (routeOptions) {
  return new LocalStore(routeOptions.timeWindow,
    routeOptions.cache, this.app, routeOptions.continueExceeding)
}

module.exports = LocalStore
