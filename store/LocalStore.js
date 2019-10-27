'use strict'

const lru = require('tiny-lru')

function LocalStore (timeWindow, cache, app) {
  this.lru = lru(cache || 5000)
  this.interval = setInterval(beat.bind(this), timeWindow).unref()
  this.app = app
  this.timeWindow = timeWindow

  app.addHook('onClose', (done) => {
    clearInterval(this.interval)
  })

  function beat () {
    this.lru.clear()
    this.msLastBeat = null
  }
}

LocalStore.prototype.incr = function (ip, cb) {
  var current = this.lru.get(ip) || 0
  this.lru.set(ip, ++current)

  // start counting from the first request/increment
  if (!this.msLastBeat) {
    this.msLastBeat = Date.now()
  }

  cb(null, { current, ttl: this.timeWindow - (Date.now() - this.msLastBeat) })
}

LocalStore.prototype.child = function (routeOptions) {
  return new LocalStore(routeOptions.config.rateLimit.timeWindow,
    routeOptions.config.rateLimit.cache, this.app)
}

module.exports = LocalStore
