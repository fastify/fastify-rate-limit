# fastify-rate-limit

[![Greenkeeper badge](https://badges.greenkeeper.io/fastify/fastify-rate-limit.svg)](https://greenkeeper.io/)

[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](http://standardjs.com/)  [![Build Status](https://travis-ci.org/fastify/fastify-rate-limit.svg?branch=master)](https://travis-ci.org/fastify/fastify-rate-limit)

A low overhead rate limiter for your routes. Supports Fastify `2.x` versions.

Please refer to [this branch](https://github.com/fastify/fastify-rate-limit/tree/1.x) and related versions for Fastify 1.x compatibility.

## Install
```
npm i fastify-rate-limit
```

## Usage
Register the plugin pass to it some custom option.<br>
This plugin will add an `onRequest` hook to check if the clients (based on their ip) has done too many request in the given timeWindow.
```js
const fastify = require('fastify')()

fastify.register(require('fastify-rate-limit'), {
  max: 100,
  timeWindow: '1 minute'
})

fastify.get('/', (req, reply) => {
  reply.send({ hello: 'world' })
})

fastify.listen(3000, err => {
  if (err) throw err
  console.log('Server listening at http://localhost:3000')
})
```

In case a client reaches the maximum number of allowed requests, a standard Fastify error will be returned to the user with the status code setted to `429`:
```js
{
  statusCode: 429,
  error: 'Too Many Requests',
  message: 'Rate limit exceeded, retry in 1 minute'
}
```

### Options
You can pass the following options during the plugin registration, the values will be used in all the routes.
```js
fastify.register(require('fastify-rate-limit'), {
  global : false, // default true
  max: 3, // default 1000
  timeWindow: 5000, // default 1000 * 60
  cache: 10000, // default 5000
  whitelist: ['127.0.0.1'], // default []
  redis: new Redis({ host: '127.0.0.1' }), // default null
  skipOnError: true, // default false
  keyGenerator: function(req) { /* ... */ }, // default (req) => req.raw.ip
})
```
- `global` : indicates if the plugin should apply a rate limit to all routes within the encapsulation scope
- `max`: is the maximum number of requests a single client can perform inside a timeWindow.
- `timeWindow:` the duration of the time window, can be expressed in milliseconds (as a number) or as a string, see [`ms`](https://github.com/zeit/ms) too see the supported formats.
- `cache`: this plugin internally uses a lru cache to handle the clients, you can change the size of the cache with this option.
- `whitelist`: array of string of ips to exclude from rate limiting.
- `redis`: by default this plugins uses an in-memory store, which is fast but if you application works on more than one server it is useless, since the data is store locally.<br>
You can pass a Redis client here and magically the issue is solved. To achieve the maximum speed, this plugins requires the use of [`ioredis`](https://github.com/luin/ioredis).
- `skipOnError`: if `true` it will skip errors generated by the storage (eg, redis not reachable).
- `keyGenerator`: a function to generate a unique identifier for each incoming request. Defaults to `(req) => req.ip`, the IP is resolved by fastify using `req.connection.remoteAddress` or `req.headers['x-forwarded-for']` if [trustProxy](https://www.fastify.io/docs/master/Server/#trustproxy) option is enabled. Use it if you want to override this behavior. Example usage:
```js
fastify.register(require('fastify-rate-limit'), {
  /* ... */
  keyGenerator: function(req) {
    return req.headers['x-real-ip'] // nginx
    || req.headers['x-client-ip'] // apache
    || req.headers['x-forwarded-for'] // use this only if you trust the header
    || req.session.username // you can limit based on any session value
    || req.raw.ip // fallback to default
})
```


### Options on the endpoint itself

Rate limiting can be configured on a per route basis by supplying rate limit configuration on the route declaration.

Regarding the `whitelist`. There are 2 types :
 - global : will affect all endpoints within the encapsulation scope
 - endpoint : will affect only the targeted endpoint

The global whitelist is configured when registering it with `fastify.register(...)`.

The endpoint whitelist is set on the endpoint directly with the `{ config : { rateLimit : { whitelist : [] } } }` object.

you need to set the option `whiteListInRedis` to `true` when registering the plugin. This is only available when using redis. 


The ACL is checking based on the value of the key from the keyGenerator. In this example we are checking the Ip but it could be a whitelist of specific user id.
```js
const fastify = require('fastify')()

fastify.register(require('fastify-rate-limit'),
  {
    global : false,
    max: 3000, // default global max rate limit
    whitelist: ['192.168.0.10'], // global whitelist access. 
    redis: redis, // connection to redis
    skipOnError: false // default false
    // keyGenerator: function(req) { /* ... */ }, // default (req) => req.raw.ip
  })

fastify.get('/', {
  config: {
    rateLimit: {
      max: 3,
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

fastify.get('/public/sub-rated-1', {
  config: {
    rateLimit: {
      timeWindow: '1 minute',
      whitelist: ['127.0.0.1'],
      onExceeding: function (req) {
        console.log('callback on exceededing ... executed before response to client')
      },
      onExceeded: function (req) {
        console.log('callback on exceeded ... to black ip in security group for example, req is give as argument')
      }
    }
  }
}, (req, reply) => {
  reply.send({ hello: 'from sub-rated-1 ... using default max value ... ' })
})
```
- `max`: is the maximum number of requests a single client can perform inside a timeWindow.
- `timeWindow:` the duration of the time window, can be expressed in milliseconds (as a number) or as a string (see [`ms`](https://github.com/zeit/ms) for supported formats).
- `onExceeding` : callback that will be executed each time a request is made to a route that is rate limited.
- `onExceeded` : callback that will be executed when a user reached the maximum number of tries. Can be useful to blacklist clients.
- `keyGenerator`: a function to generate a unique identifier for each incoming request. Defaults to `(req) => req.ip`, the IP is resolved by fastify using `req.connection.remoteAddress` or `req.headers['x-forwarded-for']` if [trustProxy](https://www.fastify.io/docs/master/Server/#trustproxy) option is enabled. Use it if you want to override this behavior.
```js



<a name="license"></a>
## License
**[MIT](https://github.com/fastify/fastify-rate-limit/blob/master/LICENSE)**<br>

Copyright © 2018 Tomas Della Vedova
