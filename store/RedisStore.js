'use strict'

function RedisStore (redis, timeWindow, continueExceeding, key) {
  this.redis = redis
  this.timeWindow = timeWindow
  this.continueExceeding = continueExceeding
  this.key = key
}

RedisStore.prototype.incr = function (ip, cb, max) {
  const key = this.key + ip

  this.redis.pipeline()
    .incr(key)
    .pttl(key)
    .exec((err, result) => {
    /**
     * result[0] => incr response: [0]: error, [1]: new incr value
     * result[1] => pttl response: [0]: error, [1]: ttl remaining
     */
      if (err || result[0][0] || result[1][0]) {
        cb(err || result[0][0] || result[1][0], { current: 1, ttl: this.timeWindow })
        return
      }

      if (result[1][1] === -1) {
        // Item just got created
        this.redis.pexpire(key, this.timeWindow, noop)
        cb(null, { current: 1, ttl: this.timeWindow })
        return
      }

      if (this.continueExceeding && result[0][1] > max) {
        // Reset TLL if max has been exceeded and `continueExceeding` is enabled
        this.redis.pexpire(key, this.timeWindow, noop)
        cb(null, { current: result[0][1], ttl: this.timeWindow })
        return
      }

      cb(null, { current: result[0][1], ttl: result[1][1] })
    })
}

RedisStore.prototype.child = function (routeOptions) {
  return new RedisStore(this.redis, routeOptions.timeWindow, routeOptions.continueExceeding, this.key + routeOptions.routeInfo.method + routeOptions.routeInfo.url + '-')
}

function noop () {}

module.exports = RedisStore
