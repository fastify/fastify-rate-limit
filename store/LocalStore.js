'use strict'

const lru = require('tiny-lru')
const ms = require('ms')

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

  const ttl = this.timeWindow - (Date.now() - this.msLastBeat)
  cb(null, { current, ttl })
}

LocalStore.prototype.child = function (routeOptions) {
  let timeWindow = routeOptions.config.rateLimit.timeWindow
  if (typeof timeWindow === 'string') {
    timeWindow = ms(timeWindow)
  }

  return new LocalStore(timeWindow, routeOptions.config.rateLimit.cache, this.app)
}

module.exports = LocalStore
