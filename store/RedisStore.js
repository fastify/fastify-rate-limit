'use strict'

const ms = require('ms')
const noop = () => {}

function RedisStore (redis, key, timeWindow) {
  this.redis = redis
  this.timeWindow = timeWindow
  this.key = key
}

RedisStore.prototype.incr = function (ip, cb) {
  var key = this.key + ip
  this.redis.pipeline()
    .incr(key)
    .pttl(key)
    .exec((err, result) => {
      if (err) return cb(err, 0)
      if (result[0][0]) return cb(result[0][0], 0)
      if (result[1][1] === -1) {
        this.redis.pexpire(key, this.timeWindow, noop)
      }
      cb(null, result[0][1])
    })
}

RedisStore.prototype.child = function (routeOptions) {
  let timeWindow = routeOptions.config.rateLimit.timeWindow
  if (typeof timeWindow === 'string') {
    timeWindow = ms(timeWindow)
  }
  const child = Object.create(this)
  child.key = this.key + routeOptions.method + routeOptions.url + '-'
  child.timeWindow = timeWindow
  return child
}

module.exports = RedisStore
