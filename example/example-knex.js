'use strict'

// Example of a Custom Store using Knex.js ORM for SQLite database
// Below is an example table to store rate limits that must be created
// in the database first
//
// CREATE TABLE "RateLimits" (
//   "Route" TEXT,
//   "Source" TEXT,
//   "Count" INTEGER,
//   "TTL" NUMERIC,
//   PRIMARY KEY("Source")
// );
//
// CREATE UNIQUE INDEX "idx_uniq_route_source" ON "RateLimits" (Route, Source);
//
const Knex = require('knex')
const fastify = require('fastify')()

const knex = Knex({
  client: 'sqlite3',
  connection: {
    filename: './db.sqlite'
  }
})

function KnexStore (options) {
  this.options = options
  this.route = ''
}

KnexStore.prototype.routeKey = function (route) {
  if (route) {
    this.route = route
  } else {
    return route
  }
}

KnexStore.prototype.incr = function (key, cb) {
  const now = (new Date()).getTime()
  const ttl = now + this.options.timeWindow
  knex.transaction(function (trx) {
    trx
      .where({ Route: this.route, Source: key })
      .then(d => {
        if (d.TTL > now) {
          trx
            .raw(`UPDATE RateLimits SET Count = 1 WHERE Route='${this.route}' AND Source='${key}'`)
            .then(() => {
              cb(null, { current: 1, ttl: d.TTL })
            })
            .catch(err => {
              cb(err, { current: 0 })
            })
        } else {
          trx
            .raw(`INSERT INTO RateLimits(Route, Source, Count, TTL) VALUES('${this.route}', '${key}',1,${d.TTL || ttl}) ON CONFLICT(Route, Source) DO UPDATE SET Count=Count+1,TTL=${ttl}`)
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
  const options = Object.assign(this.options, routeOptions)
  const store = new KnexStore(options)
  store.routeKey(routeOptions.routeInfo.method + routeOptions.routeInfo.url)
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

fastify.listen({ port: 3000 }, err => {
  if (err) throw err
  console.log('Server listening at http://localhost:3000')
})
