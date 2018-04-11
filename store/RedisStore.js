'use strict'

const noop = () => {}

function RedisStore (store, timeWindow) {
  this.store = store
  this.timeWindow = timeWindow
  this.key = 'fastify-rate-limit-'
}

RedisStore.prototype.incr = function (ip, cb) {
  var key = this.key + ip
  this.store.pipeline()
    .incr(key)
    .pttl(key)
    .exec((err, result) => {
      if (err) return cb(err)
      if (result[1][1] === -1) {
        this.store.pexpire(key, this.timeWindow, noop)
      }
      cb(null, result[0][1])
    })
}

module.exports = RedisStore
