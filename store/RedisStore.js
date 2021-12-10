'use strict'

const noop = () => { }

function RedisStore (redis, key, timeWindow, continueExceeding) {
  this.redis = redis
  this.timeWindow = timeWindow
  this.key = key
  this.continueExceeding = continueExceeding
}

RedisStore.prototype.incr = function (ip, cb) {
  const key = this.key + ip
  if (this.continueExceeding) {
    this.redis.pipeline()
      .incr(key)
      .pexpire(key, this.timeWindow)
      .exec((err, result) => {
        if (err) return cb(err, { current: 0 })
        if (result[0][0]) return cb(result[0][0], { current: 0 })
        cb(null, { current: result[0][1], ttl: this.timeWindow })
      })
  } else {
    this.redis.pipeline()
      .incr(key)
      .pttl(key)
      .exec((err, result) => {
        /**
         * result[0] => incr response: [0]: error, [1]: new incr value
         * result[1] => pttl response: [0]: error, [1]: ttl remaining
         */
        if (err) return cb(err, { current: 0 })
        if (result[0][0]) return cb(result[0][0], { current: 0 })
        if (result[1][1] === -1) {
          this.redis.pexpire(key, this.timeWindow, noop)
          result[1][1] = this.timeWindow
        }
        cb(null, { current: result[0][1], ttl: result[1][1] })
      })
  }
}

RedisStore.prototype.child = function (routeOptions) {
  const child = Object.create(this)
  child.key = this.key + routeOptions.routeInfo.method + routeOptions.routeInfo.url + '-'
  child.timeWindow = routeOptions.timeWindow
  child.continueExceeding = routeOptions.continueExceeding
  return child
}

module.exports = RedisStore
