'use strict'

const noop = () => {}

function RedisStore (redis) {
  this.redis = redis
}

RedisStore.prototype.incr = function (prefix, key, timeWindow, cb) {
  let keyName = `${prefix}:${key}`

  this.redis.pipeline()
    .incr(keyName)
    .pttl(keyName)
    .wait()
    .exec((err, result) => {
      if (err) return cb(err, 0)
      if (result[0][0]) return cb(result[0][0], 0)
      if (result[1][1] === -1) {
        this.redis.pexpire(keyName, timeWindow, noop)
      }
      cb(null, result[0][1])
    })
}

RedisStore.prototype.addWhiteList = function (route, arr, cb) {
  this.redis.pipeline()
    .del(route)
    .sadd(route, arr)
    .wait()
    .exec((err) => {
      if (err) return cb(err)
    })
}

RedisStore.prototype.isWhiteList = function (route, key, cb) {
  this.redis.pipeline()
    .sismember(route, key)
    .exec((err, result) => {
      if (err) return cb(err)
      if (result[0]) return cb(result[0], 0)
    })
}

module.exports = RedisStore
