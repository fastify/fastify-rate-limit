'use strict'

const { LruMap: Lru } = require('toad-cache')

function LocalStore (continueExceeding, exponentialBackoff, cache = 5000) {
  this.continueExceeding = continueExceeding
  this.exponentialBackoff = exponentialBackoff
  this.lru = new Lru(cache)
}

LocalStore.prototype.incr = function (ip, cb, timeWindow, max) {
  const nowInMs = Date.now()
  let current = this.lru.get(ip)

  if (!current) {
    // Item doesn't exist
    current = { current: 1, ttl: timeWindow, iterationStartMs: nowInMs }
  } else if (current.iterationStartMs + timeWindow <= nowInMs) {
    // Item has expired
    current.current = 1
    current.ttl = timeWindow
    current.iterationStartMs = nowInMs
  } else {
    // Item is alive
    ++current.current

    // Reset TLL if max has been exceeded and `continueExceeding` is enabled
    if (this.continueExceeding && current.current > max) {
      current.ttl = timeWindow
      current.iterationStartMs = nowInMs
    } else if (this.exponentialBackoff && current.current > max) {
      // Handle exponential backoff
      const backoffExponent = current.current - max - 1
      const ttl = timeWindow * (2 ** backoffExponent)
      current.ttl = Number.isSafeInteger(ttl) ? ttl : Number.MAX_SAFE_INTEGER
      current.iterationStartMs = nowInMs
    } else {
      current.ttl = timeWindow - (nowInMs - current.iterationStartMs)
    }
  }

  this.lru.set(ip, current)
  cb(null, current)
}

/**
 * Read the current rate-limit state for `ip` without mutating it.
 *
 * Stores expose `read` with the same argument contract as `incr`
 * (`ip, cb, timeWindow, max`) so the two are interchangeable; an
 * implementation may ignore the arguments it does not need (`max` here).
 *
 * `read` is a non-mutating snapshot: it never increments the counter, resets
 * the window, or advances the `continueExceeding`/`exponentialBackoff`/`ban`
 * side effects that `incr` applies. It mirrors `incr`'s window-expiry
 * detection, so a peek and a real request agree on whether the window is
 * still active.
 *
 * @param {string} ip
 * @param {(err: Error | null, res: { current: number, ttl: number }) => void} cb
 * @param {number} timeWindow
 * @param {number} [max]
 */
LocalStore.prototype.read = function (ip, cb, timeWindow, max) {
  const nowInMs = Date.now()
  const current = this.lru.get(ip)

  if (!current || current.iterationStartMs + timeWindow <= nowInMs) {
    // Item doesn't exist or has expired: report a clean state without mutating
    cb(null, { current: 0, ttl: 0 })
    return
  }

  // Item is alive: report the current state without mutating
  const ttl = timeWindow - (nowInMs - current.iterationStartMs)
  cb(null, { current: current.current, ttl })
}

LocalStore.prototype.child = function (routeOptions) {
  return new LocalStore(routeOptions.continueExceeding, routeOptions.exponentialBackoff, routeOptions.cache)
}

module.exports = LocalStore
