'use strict'

// Example of a custom store using Knex.js and MySQL.
//
// Assumes you have access to a configured knex object.
//
// Note that the rate check should place a read lock on the row.
// For MySQL see:
// https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html
// https://blog.nodeswat.com/concurrency-mysql-and-node-js-a-journey-of-discovery-31281e53572e
//
// Below is an example table to store rate limits that must be created
// in the database first.
//
// exports.up = async knex => {
//   await knex.schema.createTable('rate_limits', table => {
//     table.string('source').notNullable()
//     table.string('route').notNullable()
//     table.integer('count').unsigned()
//     table.bigInteger ('ttl')
//     table.primary(['route', 'source'])
//   })
// }
//
// exports.down = async knex => {
//   await knex.schema.dropTable('rate_limits')
// }
//
// CREATE TABLE `rate_limits` (
//   `source` varchar(255) NOT NULL,
//   `route` varchar(255) NOT NULL,
//   `count` int unsigned DEFAULT NULL,
//   `ttl` int unsigned DEFAULT NULL,
//   PRIMARY KEY (`route`,`source`)
// ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

function KnexStore(options) {
  this.options = options
  this.route = ''
}

KnexStore.prototype.routeKey = function (route) {
  if (route) this.route = route
  return route
}

KnexStore.prototype.incr = async function (key, cb) {
  const now = (new Date()).getTime()
  const ttl = now + this.options.timeWindow
  const max = this.options.max
  const cond = { route: this.route, source: key }
  await knex.transaction(async (trx) => {
    try {
      // NOTE: MySQL syntax FOR UPDATE for read lock on counter stats in row
      const row = await trx('rate_limits')
        .whereRaw('route = ? AND source = ? FOR UPDATE', [cond.route || '', cond.source]) // Create read lock
      const d = row[0]
      if (d && d.ttl > now) {
        // Optimization - no need to UPDATE if max has been reached.
        if(d.count < max) {
          try {
            await trx
              .raw('UPDATE rate_limits SET count = ? WHERE route = ? AND source = ?', [d.count + 1, cond.route, key])
            cb(null, { current: d.count + 1, ttl: d.ttl })
          } catch(err) {
            // TODO: Handle as appropriate
            fastify.log.error(err)
            cb(err, { current: 0 })
          }
        } else { // We're already at max. No UPDATE above saves a write, but we must send d.count + 1 to trigger rate limit.
          cb(null, { current: d.count +1, ttl: d.ttl })
        }
      } else {
        try {
          // NOTE: MySQL syntax for ON DUPLICATE KEY UPDATE
          await trx
            .raw('INSERT INTO rate_limits(route, source, count, ttl) VALUES(?,?,1,?) ON DUPLICATE KEY UPDATE count = 1, ttl = ?', [cond.route, key, (d && d.ttl) || ttl, ttl])
          cb(null, { current: 1, ttl: (d && d.ttl) || ttl })
        } catch(err) {
          // TODO: Handle as appropriate
          fastify.log.error(err)
          cb(err, { current: 0 })
        }
      }
    } catch(err) {
      // TODO: Handle as appropriate
      fastify.log.error(err)
      cb(err, { current: 0 })
    }
  })
}

KnexStore.prototype.child = function (routeOptions = {}) {
  // NOTE: Optionally override and set global: false here for route specific
  // options, which then allows you to use `global: true` should you
  // wish to during initial registration below.
  const options = { ...this.options, ...routeOptions, global: false }
  const store = new KnexStore(options)
  store.routeKey(routeOptions.routeInfo.method + routeOptions.routeInfo.url)
  return store
}

fastify.register(require('../../fastify-rate-limit'),
  {
    global: false,
    max: 10,
    store: KnexStore,
    skipOnError: false,
  }
)

fastify.get('/', {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: '1 minute',
    },
  },
}, (req, reply) => {
  reply.send({ hello: 'from ... root' })
})

fastify.get('/private', {
  config: {
    rateLimit: {
      max: 3,
      timeWindow: '1 minute',
    },
  },
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
