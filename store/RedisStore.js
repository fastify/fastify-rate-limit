'use strict'

const noop = () => {}

function RedisStore (redis, timeWindow) {
  this.redis = redis
  this.timeWindow = timeWindow
  this.key = 'fastify-rate-limit-'
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

module.exports = RedisStore
