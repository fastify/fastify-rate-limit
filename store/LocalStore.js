'use strict'

const lru = require('tiny-lru')
const ms = require('ms')

function LocalStore (timeWindow, cache, app) {
  this.lru = lru(cache || 5000)
  this.interval = setInterval(this.lru.clear.bind(this.lru), timeWindow).unref()
  this.app = app

  app.addHook('onClose', (done) => {
    clearInterval(this.interval)
  })
}

LocalStore.prototype.incr = function (ip, cb) {
  var current = this.lru.get(ip) || 0
  this.lru.set(ip, ++current)
  cb(null, current)
}

LocalStore.prototype.child = function (routeOptions) {
  let timeWindow = routeOptions.config.rateLimit.timeWindow
  if (typeof timeWindow === 'string') {
    timeWindow = ms(timeWindow)
  }

  return new LocalStore(timeWindow, routeOptions.config.rateLimit.cache, this.app)
}

module.exports = LocalStore
