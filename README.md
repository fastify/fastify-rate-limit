# @fastify/rate-limit

![CI](https://github.com/fastify/fastify-rate-limit/workflows/CI/badge.svg)
[![NPM version](https://img.shields.io/npm/v/@fastify/rate-limit.svg?style=flat)](https://www.npmjs.com/package/@fastify/rate-limit)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](https://standardjs.com/)

A low overhead rate limiter for your routes.


## Install
```
npm i @fastify/rate-limit
```

### Compatibility

| Plugin version | Fastify version      |
| -------------- | -------------------- |
| `^10.x`        | `^5.x`               |
| `^9.x`         | `^4.x`               |
| `^8.x`         | `^4.x`               |
| `^7.x`         | `^4.x`               |
| `^6.x`         | `^2.x` and `^3.x`    |
| `^5.x`         | `^2.x` and `^3.x`    |
| `^4.x`         | `^2.x` and `^3.x`    |
| `^3.x`         | `^2.x` and `^3.x`    |
| `^2.x`         | `^2.x`               |
| `^1.x`         | `^1.x`               |


Please note that if a Fastify version is out of support, then so are the corresponding version(s) of this plugin
in the table above.
See [Fastify's LTS policy](https://github.com/fastify/fastify/blob/main/docs/Reference/LTS.md) for more details.


## Usage
Register the plugin and, if required, pass some custom options.<br>
This plugin will add an `onRequest` hook to check if a client (based on their IP address) has made too many requests in the given timeWindow.
```js
import Fastify from 'fastify'

const fastify = Fastify()
await fastify.register(import('@fastify/rate-limit'), {
  max: 100,
  timeWindow: '1 minute'
})

fastify.get('/', (request, reply) => {
  reply.send({ hello: 'world' })
})

fastify.listen({ port: 3000 }, err => {
  if (err) throw err
  console.log('Server listening at http://localhost:3000')
})
```

In case a client reaches the maximum number of allowed requests, an error will be sent to the user with the status code set to `429`:
```js
{
  statusCode: 429,
  error: 'Too Many Requests',
  message: 'Rate limit exceeded, retry in 1 minute'
}
```
You can change the response by providing a callback to `errorResponseBuilder` or setting a [custom error handler](https://fastify.dev/docs/latest/Reference/Server/#seterrorhandler):

```js
fastify.setErrorHandler(function (error, request, reply) {
  if (error.statusCode === 429) {
    reply.code(429)
    error.message = 'You hit the rate limit! Slow down please!'
  }
  reply.send(error)
})
```

The response will have some additional headers:

| Header | Description |
|--------|-------------|
|`x-ratelimit-limit`     | how many requests the client can make
|`x-ratelimit-remaining` | how many requests remain to the client in the timewindow
|`x-ratelimit-reset`     | how many seconds must pass before the rate limit resets
|`retry-after`           | if the max has been reached, the seconds the client must wait before they can make new requests


### Preventing guessing of URLS through 404s

An attacker could search for valid URLs if your 404 error handling is not rate limited.
To rate limit your 404 response, you can use a custom handler:

```js
const fastify = Fastify()
await fastify.register(rateLimit, { global: true, max: 2, timeWindow: 1000 })
fastify.setNotFoundHandler({
  preHandler: fastify.rateLimit()
}, function (request, reply) {
  reply.code(404).send({ hello: 'world' })
})
```

Note that you can customize the behaviour of the preHandler in the same way you would for specific routes:

```js
const fastify = Fastify()
await fastify.register(rateLimit, { global: true, max: 2, timeWindow: 1000 })
fastify.setNotFoundHandler({
  preHandler: fastify.rateLimit({
    max: 4,
    timeWindow: 500
  })
}, function (request, reply) {
  reply.code(404).send({ hello: 'world' })
})
```

### Options

You can pass the following options during the plugin registration:
```js
await fastify.register(import('@fastify/rate-limit'), {
  global : false, // default true
  max: 3, // default 1000
  ban: 2, // default -1
  timeWindow: 5000, // default 1000 * 60
  hook: 'preHandler', // default 'onRequest'
  cache: 10000, // default 5000
  allowList: ['127.0.0.1'], // default []
  redis: new Redis({ host: '127.0.0.1' }), // default null
  nameSpace: 'teste-ratelimit-', // default is 'fastify-rate-limit-'
  continueExceeding: true, // default false
  skipOnError: true, // default false
  keyGenerator: function (request) { /* ... */ }, // default (request) => request.ip
  errorResponseBuilder: function (request, context) { /* ... */},
  enableDraftSpec: true, // default false. Uses IEFT draft header standard
  addHeadersOnExceeding: { // default show all the response headers when rate limit is not reached
    'x-ratelimit-limit': true,
    'x-ratelimit-remaining': true,
    'x-ratelimit-reset': true
  },
  addHeaders: { // default show all the response headers when rate limit is reached
    'x-ratelimit-limit': true,
    'x-ratelimit-remaining': true,
    'x-ratelimit-reset': true,
    'retry-after': true
  }
})
```

- `global` : indicates if the plugin should apply rate limiting to all routes within the encapsulation scope.
- `max`: maximum number of requests a single client can perform inside a timeWindow. It can be an async function with the signature `async (request, key) => {}` where `request` is the Fastify request object and `key` is the value generated by the `keyGenerator`. The function **must** return a number.
- `ban`: maximum number of 429 responses to return to a client before returning 403 responses. When the ban limit is exceeded, the context argument that is passed to `errorResponseBuilder` will have its `ban` property set to `true`. **Note:** `0` can also be passed to directly return 403 responses when a client exceeds the `max` limit.
- `timeWindow:` the duration of the time window. It can be expressed in milliseconds, as a string (in the [`ms`](https://github.com/zeit/ms) format), or as an async function with the signature `async (request, key) => {}` where `request` is the Fastify request object and `key` is the value generated by the `keyGenerator`. The function **must** return a number.
- `cache`: this plugin internally uses a lru cache to handle the clients, you can change the size of the cache with this option
- `allowList`: array of string of ips to exclude from rate limiting. It can be a sync or async function with the signature `(request, key) => {}` where `request` is the Fastify request object and `key` is the value generated by the `keyGenerator`. If the function return a truthy value, the request will be excluded from the rate limit.
- `redis`: by default, this plugin uses an in-memory store, but if an application runs on multiple servers, an external store will be needed. This plugin requires the use of [`ioredis`](https://github.com/redis/ioredis).<br> **Note:** the [default settings](https://github.com/redis/ioredis/blob/v4.16.0/API.md#new_Redis_new) of an ioredis instance are not optimal for rate limiting. We recommend customizing the `connectTimeout` and `maxRetriesPerRequest` parameters as shown in the [`example`](https://github.com/fastify/fastify-rate-limit/tree/master/example/example.js).
- `nameSpace`: choose which prefix to use in the redis, default is 'fastify-rate-limit-'
- `continueExceeding`: Renew user limitation when user sends a request to the server when still limited
- `store`: a custom store to track requests and rates which allows you to use your own storage mechanism (using an RDBMS, MongoDB, etc.) as well as further customizing the logic used in calculating the rate limits. A simple example is provided below as well as a more detailed example using Knex.js can be found in the [`example/`](https://github.com/fastify/fastify-rate-limit/tree/master/example) folder
- `skipOnError`: if `true` it will skip errors generated by the storage (e.g. redis not reachable).
- `keyGenerator`: a sync or async function to generate a unique identifier for each incoming request. Defaults to `(request) => request.ip`, the IP is resolved by fastify using `request.connection.remoteAddress` or `request.headers['x-forwarded-for']` if [trustProxy](https://fastify.dev/docs/latest/Reference/Server/#trustproxy) option is enabled. Use it if you want to override this behavior
- `groupId`: a string to group multiple routes together introducing separate per-group rate limit. This will be added on top of the result of `keyGenerator`.
- `errorResponseBuilder`: a function to generate a custom response object. Defaults to `(request, context) => ({statusCode: 429, error: 'Too Many Requests', message: ``Rate limit exceeded, retry in ${context.after}``})`
- `addHeadersOnExceeding`: define which headers should be added in the response when the limit is not reached. Defaults all the headers will be shown
- `addHeaders`: define which headers should be added in the response when the limit is reached. Defaults all the headers will be shown
- `enableDraftSpec`: if `true` it will change the HTTP rate limit headers following the IEFT draft document. More information at [draft-ietf-httpapi-ratelimit-headers.md](https://github.com/ietf-wg-httpapi/ratelimit-headers/blob/f6a7bc7560a776ea96d800cf5ed3752d6d397b06/draft-ietf-httpapi-ratelimit-headers.md).
- `onExceeding`: callback that will be executed before request limit has been reached. 
- `onExceeded`: callback that will be executed after request limit has been reached.
- `onBanReach`: callback that will be executed when the ban limit has been reached.

`keyGenerator` example usage:
```js
await fastify.register(import('@fastify/rate-limit'), {
  /* ... */
  keyGenerator: function (request) {
    return request.headers['x-real-ip'] // nginx
    || request.headers['x-client-ip'] // apache
    || request.headers['x-forwarded-for'] // use this only if you trust the header
    || request.session.username // you can limit based on any session value
    || request.ip // fallback to default
  }
})
```

Variable `max` example usage:
```js
// In the same timeWindow, the max value can change based on request and/or key like this
fastify.register(rateLimit, {
  /* ... */
  keyGenerator (request) { return request.headers['service-key'] },
  max: async (request, key) => { return key === 'pro' ? 3 : 2 },
  timeWindow: 1000
})
```

`errorResponseBuilder` example usage:
```js
await fastify.register(import('@fastify/rate-limit'), {
  /* ... */
  errorResponseBuilder: function (request, context) {
    return {
      statusCode: 429,
      error: 'Too Many Requests',
      message: `I only allow ${context.max} requests per ${context.after} to this Website. Try again soon.`,
      date: Date.now(),
      expiresIn: context.ttl // milliseconds
    }
  }
})
```

Dynamic `allowList` example usage:
```js
await fastify.register(import('@fastify/rate-limit'), {
  /* ... */
  allowList: function (request, key) {
    return request.headers['x-app-client-id'] === 'internal-usage'
  }
})
```

Custom `hook` example usage (after authentication):
```js
await fastify.register(import('@fastify/rate-limit'), {
  hook: 'preHandler',
  keyGenerator: function (request) {
    return request.userId || request.ip
  }
})

fastify.decorateRequest('userId', '')
fastify.addHook('preHandler', async function (request) {
  const { userId } = request.query
  if (userId) {
    request.userId = userId
  }
})
```

Custom `store` example usage:

NOTE: The ```timeWindow``` will always be passed as the numeric value in millseconds into the store's constructor.

```js
function CustomStore (options) {
  this.options = options
  this.current = 0
}

CustomStore.prototype.incr = function (key, cb) {
  const timeWindow = this.options.timeWindow
  this.current++
  cb(null, { current: this.current, ttl: timeWindow - (this.current * 1000) })
}

CustomStore.prototype.child = function (routeOptions) {
  // We create a merged copy of the current parent parameters with the specific
  // route parameters and pass them into the child store.
  const childParams = Object.assign(this.options, routeOptions)
  const store = new CustomStore(childParams)
  // Here is where you may want to do some custom calls on the store with the information
  // in routeOptions first...
  // store.setSubKey(routeOptions.method + routeOptions.url)
  return store
}

await fastify.register(import('@fastify/rate-limit'), {
  /* ... */
  store: CustomStore
})
```

The `routeOptions` object passed to the `child` method of the store will contain the same options that are detailed above for plugin registration with any specific overrides provided on the route. In addition, the following parameter is provided:

- `routeInfo`: The configuration of the route including `method`, `url`, `path`, and the full route `config`

Custom `onExceeding` example usage:
```js
await fastify.register(import('@fastify/rate-limit'), {
  /* */
  onExceeding: function (req, key) {
    console.log('callback on exceeding ... executed before response to client')
  }
})
```

Custom `onExceeded` example usage:
```js
await fastify.register(import('@fastify/rate-limit'), {
  /* */
  onExceeded: function (req, key) {
    console.log('callback on exceeded ... executed before response to client')
  }
})
```

Custom `onBanReach` example usage:
```js
await fastify.register(import('@fastify/rate-limit'), {
  /* */
  ban: 10,
  onBanReach: function (req, key) {
    console.log('callback on exceeded ban limit')
  }
})
```

### Options on the endpoint itself

Rate limiting can be also can be configured at the route level, applying the configuration independently.

For example the `allowList` if configured:
 - on plugin registration will affect all endpoints within the encapsulation scope
 - on route declaration will affect only the targeted endpoint

The global allowlist is configured when registering it with `fastify.register(...)`.

The endpoint allowlist is set on the endpoint directly with the `{ config : { rateLimit : { allowList : [] } } }` object.

ACL checking is performed based on the value of the key from the `keyGenerator`.

In this example we are checking the IP address, but it could be an allowlist of specific user identifiers (like JWT or tokens):

```js
import Fastify from 'fastify'

const fastify = Fastify()
await fastify.register(import('@fastify/rate-limit'),
  {
    global : false, // don't apply these settings to all the routes of the context
    max: 3000, // default global max rate limit
    allowList: ['192.168.0.10'], // global allowlist access.
    redis: redis, // custom connection to redis
  })

// add a limited route with this configuration plus the global one
fastify.get('/', {
  config: {
    rateLimit: {
      max: 3,
      timeWindow: '1 minute'
    }
  }
}, (request, reply) => {
  reply.send({ hello: 'from ... root' })
})

// add a limited route with this configuration plus the global one
fastify.get('/private', {
  config: {
    rateLimit: {
      max: 3,
      timeWindow: '1 minute'
    }
  }
}, (request, reply) => {
  reply.send({ hello: 'from ... private' })
})

// this route doesn't have any rate limit
fastify.get('/public', (request, reply) => {
  reply.send({ hello: 'from ... public' })
})

// add a limited route with this configuration plus the global one
fastify.get('/public/sub-rated-1', {
  config: {
    rateLimit: {
      timeWindow: '1 minute',
      allowList: ['127.0.0.1'],
      onExceeding: function (request, key) {
        console.log('callback on exceededing ... executed before response to client')
      },
      onExceeded: function (request, key) {
        console.log('callback on exceeded ... to black ip in security group for example, request is give as argument')
      }
    }
  }
}, (request, reply) => {
  reply.send({ hello: 'from sub-rated-1 ... using default max value ... ' })
})

// gorup routes and add a rate limit
fastify.get('/otp/send', {
  config: {
    rateLimit: {
      max: 3,
      timeWindow: '1 minute',
      groupId:"OTP"
    }
  }
}, (request, reply) => {
  reply.send({ hello: 'from ... grouped rate limit' })
})

fastify.get('/otp/resend', {
  config: {
    rateLimit: {
      max: 3,
      timeWindow: '1 minute',
      groupId:"OTP"
    }
  }
}, (request, reply) => {
  reply.send({ hello: 'from ... grouped rate limit' })
})
```

In the route creation you can override the same settings of the plugin registration plus the following additional options:

- `onExceeding` : callback that will be executed each time a request is made to a route that is rate limited
- `onExceeded` : callback that will be executed when a user reached the maximum number of tries. Can be useful to blacklist clients

You may also want to set a global rate limiter and then disable on some routes:

```js
import Fastify from 'fastify'

const fastify = Fastify()
await fastify.register(import('@fastify/rate-limit'), {
  max: 100,
  timeWindow: '1 minute'
})

// add a limited route with global config
fastify.get('/', (request, reply) => {
  reply.send({ hello: 'from ... rate limited root' })
})

// this route doesn't have any rate limit
fastify.get('/public', {
  config: {
    rateLimit: false
  }
}, (request, reply) => {
  reply.send({ hello: 'from ... public' })
})

// add a limited route with global config and different max
fastify.get('/private', {
  config: {
    rateLimit: {
      max: 9
    }
  }
}, (request, reply) => {
  reply.send({ hello: 'from ... private and more limited' })
})
```

### Examples of Custom Store

These examples show an overview of the `store` feature and you should take inspiration from it and tweak as you need:

- [Knex-SQLite](./example/example-knex.js)
- [Knex-MySQL](./example/example-knex-mysql.js)
- [Sequelize-PostgreSQL](./example/example-sequelize.js)

### IETF Draft Spec Headers

The response will have the following headers if `enableDraftSpec` is `true`:


| Header | Description |
|--------|-------------|
|`ratelimit-limit`       | how many requests the client can make
|`ratelimit-remaining`   | how many requests remain to the client in the timewindow
|`ratelimit-reset`       | how many seconds must pass before the rate limit resets
|`retry-after`           | contains the same value in time as `ratelimit-reset`

### Contribute
To run tests locally, you need a Redis instance that you can launch with this command:
```
npm run redis
```

<a name="license"></a>
## License
**[MIT](https://github.com/fastify/fastify-rate-limit/blob/master/LICENSE)**<br>

Copyright © 2018 Tomas Della Vedova
