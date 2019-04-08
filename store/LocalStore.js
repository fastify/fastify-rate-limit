'use strict'

const lru = require('tiny-lru')

function LocalStore (opts) {
  this.lru = lru(opts)
  this.timers = {}
}

LocalStore.prototype.incr = function (prefix, key, timeWindow, cb) {
  let keyName = `${prefix}:${key}`
  let current = this.lru.get(keyName) || 0
  this.lru.set(keyName, ++current)

  if (!this.timers[keyName]) {
    this.timers[keyName] = setTimeout(() => {
      this.lru.delete(keyName)
      this.timers[keyName] = null
    }, timeWindow).unref()
  }

  cb(null, current)
}

module.exports = LocalStore
