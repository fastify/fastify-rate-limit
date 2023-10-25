'use strict'

function RedisStore (redis, timeWindow, continueExceeding, key) {
  this.redis = redis
  this.timeWindow = timeWindow
  this.continueExceeding = continueExceeding
  this.key = key
}

RedisStore.prototype.incr = function (ip, cb, max) {
  if (this.redis.options.enableAutoPipelining) this.incrAutoPipe(ip, cb, max)
  else this.incrNormal(ip, cb, max)
}

RedisStore.prototype.incrAutoPipe = async function (ip, cb, max) {
  const key = this.key + ip
  const [current, ttl] = await Promise.all([this.redis.incr(key), this.redis.pttl(key)])

  if (ttl === -1) {
    // Item just got created
    this.redis.pexpire(key, this.timeWindow).catch()
    cb(null, { current: 1, ttl: this.timeWindow })
    return
  }

  if (this.continueExceeding && current > max) {
    // Reset TLL if max has been exceeded and `continueExceeding` is enabled
    this.redis.pexpire(key, this.timeWindow).catch()
    cb(null, { current, ttl: this.timeWindow })
    return
  }

  cb(null, { current, ttl })
}

RedisStore.prototype.incrNormal = async function (ip, cb, max) {
  const key = this.key + ip
  const result = await this.redis.pipeline()
    .incr(key)
    .pttl(key)
    .exec()

  /**
   * result[0] => incr response: [0]: error, [1]: new incr value
   * result[1] => pttl response: [0]: error, [1]: ttl remaining
  */
  if (result[0][0] || result[1][0]) {
    cb(result[0][0] || result[1][0], null)
    return
  }

  if (result[1][1] === -1) {
    // Item just got created
    this.redis.pexpire(key, this.timeWindow).catch()
    cb(null, { current: 1, ttl: this.timeWindow })
    return
  }

  if (this.continueExceeding && result[0][1] > max) {
    // Reset TLL if max has been exceeded and `continueExceeding` is enabled
    this.redis.pexpire(key, this.timeWindow).catch()
    cb(null, { current: result[0][1], ttl: this.timeWindow })
    return
  }

  cb(null, { current: result[0][1], ttl: result[1][1] })
}

RedisStore.prototype.child = function (routeOptions) {
  return new RedisStore(this.redis, routeOptions.timeWindow, routeOptions.continueExceeding, this.key + routeOptions.routeInfo.method + routeOptions.routeInfo.url + '-')
}

module.exports = RedisStore
