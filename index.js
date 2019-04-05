'use strict'

const FJS = require('fast-json-stringify');
const ms = require('ms');

const LocalStore = require('./store/LocalStore')
const RedisStore = require('./store/RedisStore')

const serializeError = FJS({
  type: 'object',
  properties: {
    statusCode: { type: 'number' },
    error: { type: 'string' },
    message: { type: 'string' }
  }
})

function rateLimitPlugin (opts) {
  const timeWindow = typeof opts.timeWindow === 'string'
    ? ms(opts.timeWindow)
    : typeof opts.timeWindow === 'number'
      ? opts.timeWindow
      : 1000 * 60

  const store = opts.redis
    ? new RedisStore(opts.redis, timeWindow)
    : new LocalStore(timeWindow, opts.cache)

  const keyGenerator = typeof opts.keyGenerator === 'function'
    ? opts.keyGenerator
    : (req) => req.ip;

  const skipOnError = opts.skipOnError === true;
  const max = opts.max || 1000
  const whitelist = opts.whitelist || [];

  const after = ms(timeWindow, { long: true });

  function rateLimit (req, res, next) {
    var key = keyGenerator(req)
    if (whitelist.indexOf(key) > -1) {
      next()
    } else {
      store.incr(key, onIncr)
    }

    function onIncr (err, current) {
      if (err && skipOnError === false) return next(err)

      if (current <= max) {
        res.setHeader('X-RateLimit-Limit', max);
        res.setHeader('X-RateLimit-Remaining', max - current)
        next()
      } else {
        const body = serializeError({
          statusCode: 429,
          error: 'Too Many Requests',
          message: `Rate limit exceeded, retry in ${after}`
        });
        res.writeHead(429, {
          'Content-Type' : 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-RateLimit-Limit' : max,
          'X-RateLimit-Remaining' : 0,
          'Retry-After' : timeWindow
        }).end(body);
      }
    }
  }

  return rateLimit
}

module.exports = rateLimitPlugin;
