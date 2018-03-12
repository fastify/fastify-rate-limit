# fastify-rate-limit

[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](http://standardjs.com/)  [![Build Status](https://travis-ci.org/fastify/fastify-rate-limit.svg?branch=master)](https://travis-ci.org/fastify/fastify-rate-limit)

A low overhead rate limiter for your routes.


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
  max: 3, // default 1000
  timeWindow: 5000, // default 1000 * 60
  cache: 10000, // default 5000
  whitelist: ['127.0.0.1'] // default []
})
```
- `max`: is the maximum numbers of request a single client can perform inside a timeWindow.
- `timeWindow:` the duration of the time window, can be expressed in milliseconds (as a number) or as a string, see [`ms`](https://github.com/zeit/ms) too see the supported formats.
- `cache`: this plugin internally uses a lru cache to handle the clients, you can change the size of the cache with this option.
- `whitelist`: array of string of ips to exlude from rate limiting

<a name="license"></a>
## License
**[MIT](https://github.com/fastify/fastify-rate-limit/blob/master/LICENSE)**<br>

Copyright © 2018 Tomas Della Vedova
