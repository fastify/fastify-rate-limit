'use strict'

function LocalStore (store, timeWindow) {
  this.store = store
  setInterval(this.store.reset.bind(this.store), timeWindow).unref()
}

LocalStore.prototype.incr = function (ip, cb) {
  var current = this.store.get(ip) || 0
  this.store.set(ip, ++current)
  cb(null, current)
}

module.exports = LocalStore
