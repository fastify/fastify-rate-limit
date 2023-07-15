'use strict'

const inherits = require('util').inherits
const Readable = require('stream').Readable

// Readable stream impl that outputs random data very quickly
function RandomStream (n) {
  Readable.call(this)
  this.remaining = +n
}

inherits(RandomStream, Readable)

RandomStream.prototype._read = function (n, cb) {
  if (typeof cb !== 'function') cb = function (e, b) { this.push(b) }.bind(this)
  n = Math.min(this.remaining, n)
  this.remaining -= n
  let chunk = null
  if (n > 0) {
    chunk = Buffer.alloc(n)
  }
  cb(null, chunk)
}

module.exports = {
  RandomStream
}
