'use strict'

const inherits = require('util').inherits
const Readable = require('stream').Readable

// Readable stream impl that outputs random data with a 100 ms delay per byte
function SlowRandomStream (n) {
  Readable.call(this)
  this.remaining = +n
}

inherits(SlowRandomStream, Readable)

SlowRandomStream.prototype._read = function (n, cb) {
  if (typeof cb !== 'function') cb = function (e, b) { this.push(b) }.bind(this)
  n = 1
  this.remaining -= n
  if (this.remaining >= 0) {
    setTimeout(cb.bind(null, null, Buffer.alloc(n)), 100)
  } else {
    cb(null, null) // emit "end"
  }
}

module.exports = {
  SlowRandomStream
}
