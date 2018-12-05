'use strict'

const lru = require('tiny-lru')

function LocalStore (timeWindow, cache) {
  this.lru = lru(cache || 5000)
  setInterval(this.lru.clear.bind(this.lru), timeWindow).unref()
}

LocalStore.prototype.incr = function (ip, cb) {
  var current = this.lru.get(ip) || 0
  this.lru.set(ip, ++current)
  cb(null, current)
}

module.exports = LocalStore
