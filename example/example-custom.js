'use strict'

// Custom Store using Knex.js, below is an example
// table to store rate limits that must be created in the
// the database first
//
// CREATE TABLE "RateLimits" (
//   "Source" TEXT,
//   "Count" INTEGER,
//   "TTL" NUMERIC,
//   PRIMARY KEY("Source")
// );
//
const Knex = require('knex')
const fastify = require('fastify')()

var knex = Knex({
  client: 'sqlite3',
  connection: {
    filename: './db.sqlite'
  }
})

function KnexStore (timeWindow, key) {
  this.timeWindow = timeWindow
  this.key = key
}

KnexStore.prototype.incr = function (key, cb) {
  const now = (new Date()).getTime()
  const ttl = now + this.timeWindow
  knex.transaction(function (trx) {
    trx
      .where('Source', key)
      .then(d => {
        if (d.TTL > now) {
          trx
            .raw(`UPDATE RateLimits SET Count = 1 WHERE Source='${key}'`)
            .then(() => {
              cb(null, { current: 1, ttl: d.TTL })
            })
            .catch(err => {
              cb(err, { current: 0 })
            })
        } else {
          trx
            .raw(`INSERT INTO RateLimits(Source, Count, TTL) VALUES('${key}',1,${d.TTL || ttl}) ON CONFLICT(Source) DO UPDATE SET Count=Count+1`)
            .then(() => {
              cb(null, { current: d.Count ? d.Count + 1 : 1, ttl: d.TTL || ttl })
            })
            .catch(err => {
              cb(err, { current: 0 })
            })
        }
      })
      .catch(err => {
        cb(err, { current: 0 })
      })
  })
}

KnexStore.prototype.child = function (routeOptions) {
  const timeWindow = routeOptions.config.rateLimit.timeWindow
  const key = this.key + routeOptions.method + routeOptions.url + '-'
  const store = new KnexStore(timeWindow, key)
  return store
}

fastify.register(require('../../fastify-rate-limit'),
  {
    global: false,
    max: 10,
    store: KnexStore,
    skipOnError: false
  }
)

fastify.get('/', {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: '1 minute'
    }
  }
}, (req, reply) => {
  reply.send({ hello: 'from ... root' })
})

fastify.get('/private', {
  config: {
    rateLimit: {
      max: 3,
      timeWindow: '1 minute'
    }
  }
}, (req, reply) => {
  reply.send({ hello: 'from ... private' })
})

fastify.get('/public', (req, reply) => {
  reply.send({ hello: 'from ... public' })
})

fastify.listen(3000, err => {
  if (err) throw err
  console.log('Server listening at http://localhost:3000')
})
