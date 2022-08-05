'use strict'

// Example of a Custom Store using Sequelize ORM for PostgreSQL database

// Sequelize Migration for "RateLimits" table
//
// module.exports = {
//   up: (queryInterface, { TEXT, INTEGER, BIGINT }) => {
//     return queryInterface.createTable(
//       'RateLimits',
//       {
//         Route: {
//           type: TEXT,
//           allowNull: false
//         },
//         Source: {
//           type: TEXT,
//           allowNull: false,
//           primaryKey: true
//         },
//         Count: {
//           type: INTEGER,
//           allowNull: false
//         },
//         TTL: {
//           type: BIGINT,
//           allowNull: false
//         }
//       },
//       {
//         freezeTableName: true,
//         timestamps: false,
//         uniqueKeys: {
//           unique_tag: {
//             customIndex: true,
//             fields: ['Route', 'Source']
//           }
//         }
//       }
//     )
//   },
//   down: queryInterface => {
//     return queryInterface.dropTable('RateLimits')
//   }
// }

const fastify = require('fastify')()
const Sequelize = require('sequelize')

const databaseUri = 'postgres://username:password@localhost:5432/fastify-rate-limit-example'
const sequelize = new Sequelize(databaseUri)
// OR
// const sequelize = new Sequelize('database', 'username', 'password');

// Sequelize Model for "RateLimits" table
//
const RateLimits = sequelize.define(
  'RateLimits',
  {
    Route: {
      type: Sequelize.TEXT,
      allowNull: false
    },
    Source: {
      type: Sequelize.TEXT,
      allowNull: false,
      primaryKey: true
    },
    Count: {
      type: Sequelize.INTEGER,
      allowNull: false
    },
    TTL: {
      type: Sequelize.BIGINT,
      allowNull: false
    }
  },
  {
    freezeTableName: true,
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['Route', 'Source']
      }
    ]
  }
)

function RateLimiterStore (options) {
  this.options = options
  this.route = ''
}

RateLimiterStore.prototype.routeKey = function routeKey (route) {
  if (route) this.route = route
  return route
}

RateLimiterStore.prototype.incr = async function incr (key, cb) {
  const now = new Date().getTime()
  const ttl = now + this.options.timeWindow
  const cond = { Route: this.route, Source: key }

  const RateLimit = await RateLimits.findOne({ where: cond })

  if (RateLimit && parseInt(RateLimit.TTL, 10) > now) {
    try {
      await RateLimit.update({ Count: RateLimit.Count + 1 }, cond)
      cb(null, {
        current: RateLimit.Count + 1,
        ttl: RateLimit.TTL
      })
    } catch (err) {
      cb(err, {
        current: 0
      })
    }
  } else {
    sequelize.query(
            `INSERT INTO "RateLimits"("Route", "Source", "Count", "TTL")
            VALUES('${this.route}', '${key}', 1,
            ${(RateLimit && RateLimit.TTL) || ttl})
            ON CONFLICT("Route", "Source") DO UPDATE SET "Count"=1, "TTL"=${ttl}`
    )
      .then(() => {
        cb(null, {
          current: 1,
          ttl: (RateLimit && RateLimit.TTL) || ttl
        })
      })
      .catch(err => {
        cb(err, {
          current: 0
        })
      })
  }
}

RateLimiterStore.prototype.child = function child (routeOptions = {}) {
  const options = Object.assign(this.options, routeOptions)
  const store = new RateLimiterStore(options)
  store.routeKey(routeOptions.routeInfo.method + routeOptions.routeInfo.url)
  return store
}

fastify.register(require('../../fastify-rate-limit'),
  {
    global: false,
    max: 10,
    store: RateLimiterStore,
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
