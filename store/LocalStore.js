'use strict'

const lru = require('tiny-lru')

function LocalStore (opts) {
  this.lru = lru(opts || 5000)
  this.timers = {}
}

LocalStore.prototype.incr = function (key, timeWindow, cb) {
  let current = this.lru.get(key) || 0
  this.lru.set(key, ++current)

  if (!this.timers[key]) {
    this.timers[key] = setTimeout(() => {
      this.lru.remove(key)
      this.timers[key] = null
    }, timeWindow)
  }

  cb(null, current)
}

module.exports = LocalStore
