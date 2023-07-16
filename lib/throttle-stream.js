'use strict'

const { Transform } = require('stream')
const { trampoline } = require('./trampoline')
const { bpsToBpsFn } = require('./bps-to-bps-fn')

/**
 * The internal passthrough logic...
 *
 * This `_data` function gets "trampolined" to prevent stack overflows for tight
 * loops. This technique requires us to return a "thunk" function for any
 * synchronous action. Async stuff breaks the trampoline, but that's okay since it's
 * working with a new stack at that point anyway.
 *
 * @param {ThrottleStream} stream
 * @param {Buffer} chunk
 * @param {Function} fn
 */
function _data (stream, chunk, fn) {
  if (chunk.length <= stream._bytesLeft) {
    // small buffer fits within the "_bytesLeft" window
    return stream._process(chunk, fn)
  } else {
    // large buffer needs to be sliced on "_bytesLeft" and processed
    const chunkSlice = chunk.slice(0, stream._bytesLeft)
    return stream._process(chunkSlice, function callback (err) {
      /* istanbul ignore next */
      if (err) return fn(err)
      return _data.bind(null, stream, chunk.slice(chunkSlice.length), fn)
    })
  }
}

const data = trampoline(_data)

/**
 * The `ThrottleStream` is very similar to the node core
 * `stream.Transform` stream, except that you specify a `bps` "bytes per
 * second" option and data *will not* be passed through faster than the byte
 * value you specify.
 *
 * You can invoke it with a function for `bps` that takes the elapsed time (in seconds)
 * and the number of bytes already sent as parameters. The function should return
 * the desired bytes per second value.
 *
 * @param {Object} opts an options object or the "bps" function value
 * @api public
 * @constructor ThrottleStream
 * @extends Transform
 * @param {Object} [opts] - options
 * @param {number|Function} [opts.bps] - function that returns bytes per second to throttle to
 * @param {number} [opts.chunkSize] - default: 1638
 */
function ThrottleStream (opts) {
  if (!new.target) {
    return new ThrottleStream(opts)
  }

  Transform.call(this, opts)

  /**
   * The function to calculate bytes per second to throttle to
   * @type {Function}
   * @public
   * @memberof ThrottleStream
   * @name bpsFn
   * @default null
   */
  this.bpsFn = typeof opts?.bps === 'undefined' || typeof opts?.bps === 'number'
    ? bpsToBpsFn(opts?.bps || 16384)
    : opts?.bps

  /**
   * The number of bytes to send per "chunk"
   * @type {number}
   * @public
   * @memberof ThrottleStream
   * @name chunkSize
   * @default 1638
   */
  this.chunkSize = typeof opts?.bps === 'number'
    ? Math.floor(Math.max(1, opts.bps / 10))
    : 1638

  /**
   * The time that the stream started
   * @type {number}
   * @public
   * @memberof ThrottleStream
   * @name startTime
   * @default null
   */
  this.startTime = null

  /**
   * The number of bytes that have been sent through the stream
   * @type {number}
   * @public
   * @memberof ThrottleStream
   * @name bytes
   * @default 0
   */
  this.bytes = 0

  /**
   * Number of bytes left to parse for the next "chunk"
   * @type {number}
   * @private
   * @default 0
   */
  this._bytesLeft = 0
}

ThrottleStream.prototype = Object.create(Transform.prototype, {
  constructor: {
    value: ThrottleStream,
    enumerable: false,
    writable: true,
    configurable: true
  }
})

/**
 * The internal `_transform` function is called by the `write` function of the
 * `Transform` stream base class. This function is not intended to be called
 * directly.
 * @param {Buffer} chunk
 * @param {string} encoding
 * @param {Function} fn
 */
ThrottleStream.prototype._transform = function (chunk, encoding, fn) {
  if (this.startTime === null) {
    this.startTime = Date.now()
  }

  data(this, chunk, fn)
}

/**
 * The internal `process` function gets called by the `data` function when
 * something "interesting" happens. This function takes care of buffering the
 * bytes when buffering, passing through the bytes when doing that, and invoking
 * the user callback when the number of bytes has been reached.
 *
 * @memberof ThrottleStream
 * @method _process
 * @param {Buffer} chunk
 * @param {Function} fn
 */
ThrottleStream.prototype._process = function (chunk, fn) {
  this.push(chunk)
  this.bytes += chunk.length
  this._bytesLeft -= chunk.length

  if (this._bytesLeft === 0) {
    const done = trampoline(fn)

    const bytes = this.bytes
    const elapsedTime = (Date.now() - this.startTime) / 1000
    const expected = Math.floor(this.bpsFn(elapsedTime, bytes) * elapsedTime)

    if (expected === 0) {
      setTimeout(done, 100)
      return
    } else if (bytes > expected) {
      /*
       * Calculate how many seconds ahead we are.
       */
      const sleepTime = (bytes - expected) / this.bpsFn(elapsedTime, bytes) * 1000
      setTimeout(done, sleepTime)
      return
    }

    this._bytesLeft = this.chunkSize
    done()
  } else {
    // need more bytes
    return fn
  }
}

module.exports = {
  ThrottleStream
}
