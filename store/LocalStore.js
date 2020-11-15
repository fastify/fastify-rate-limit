'use strict'

const lru = require('tiny-lru')

function LocalStore (timeWindow, cache, app) {
  this.lru = lru(cache || 5000)
  this.interval = setInterval(beat.bind(this), timeWindow).unref()
  this.app = app
  this.timeWindow = timeWindow

  app.addHook('onClose', (instance, done) => {
    clearInterval(this.interval)
    done()
  })

  function beat () {
    this.lru.clear()
    this.msLastBeat = null
  }
}

LocalStore.prototype.incr = function (ip, cb) {
  let current = this.lru.get(ip) || 0
  this.lru.set(ip, ++current)

  // start counting from the first request/increment
  if (!this.msLastBeat) {
    this.msLastBeat = Date.now()
  }

  cb(null, { current, ttl: this.timeWindow - (Date.now() - this.msLastBeat) })
}

LocalStore.prototype.child = function (routeOptions) {
  return new LocalStore(routeOptions.timeWindow,
    routeOptions.cache, this.app)
}

module.exports = LocalStore
