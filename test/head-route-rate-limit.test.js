'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const rateLimit = require('../index')

const rateLimitConfig = () => ({ max: 1, timeWindow: 60000 })

async function build (options) {
  const fastify = Fastify(options)
  await fastify.register(rateLimit, { global: false })
  return fastify
}

test('generated HEAD and GET share a per-route store', async (t) => {
  for (const methods of [['GET', 'HEAD'], ['HEAD', 'GET']]) {
    await t.test(methods.join(' then '), async (t) => {
      const fastify = await build()
      t.after(() => fastify.close())

      fastify.get('/resource', {
        config: { rateLimit: rateLimitConfig() }
      }, async () => 'ok')

      const first = await fastify.inject({ method: methods[0], url: '/resource' })
      const second = await fastify.inject({ method: methods[1], url: '/resource' })

      t.assert.strictEqual(first.statusCode, 200)
      t.assert.strictEqual(second.statusCode, 429)
    })
  }
})

test('generated HEAD shares a store when an earlier hook wraps handlers', async (t) => {
  const fastify = Fastify()
  fastify.addHook('onRoute', function wrapHandler (routeOptions) {
    const handler = routeOptions.handler
    routeOptions.handler = function wrappedHandler (...args) {
      return handler.apply(this, args)
    }
  })
  await fastify.register(rateLimit, { global: false })
  t.after(() => fastify.close())

  fastify.get('/resource', {
    config: { rateLimit: rateLimitConfig() }
  }, async () => 'ok')

  t.assert.strictEqual((await fastify.inject('/resource')).statusCode, 200)
  t.assert.strictEqual((await fastify.inject({ method: 'HEAD', url: '/resource' })).statusCode, 429)
})

test('generated HEAD aliases for a prefixed root share the GET store', async (t) => {
  const fastify = await build()
  t.after(() => fastify.close())

  await fastify.register(async function routes (fastify) {
    fastify.get('/', {
      config: {
        rateLimit: { max: 2, timeWindow: 60000 }
      }
    }, async () => 'ok')
  }, { prefix: '/prefix' })

  const get = await fastify.inject({ method: 'GET', url: '/prefix' })
  const headWithSlash = await fastify.inject({ method: 'HEAD', url: '/prefix/' })
  const headWithoutSlash = await fastify.inject({ method: 'HEAD', url: '/prefix' })

  t.assert.strictEqual(get.statusCode, 200)
  t.assert.strictEqual(headWithSlash.statusCode, 200)
  t.assert.strictEqual(headWithoutSlash.statusCode, 429)
})

test('an empty prefixed route does not share with explicit slash routes', async (t) => {
  const fastify = await build()
  t.after(() => fastify.close())

  const config = rateLimitConfig()
  const handler = async () => 'ok'

  await fastify.register(async function routes (fastify) {
    fastify.get('', { config: { rateLimit: config } }, handler)
    fastify.get('/', {
      prefixTrailingSlash: 'slash',
      exposeHeadRoute: false,
      config: { rateLimit: config }
    }, handler)
    fastify.head('/', { config: { rateLimit: config } }, handler)
  }, { prefix: '/prefix' })

  t.assert.strictEqual((await fastify.inject('/prefix')).statusCode, 200)
  t.assert.strictEqual((await fastify.inject({ method: 'HEAD', url: '/prefix' })).statusCode, 429)
  t.assert.strictEqual((await fastify.inject({ method: 'HEAD', url: '/prefix/' })).statusCode, 200)
  t.assert.strictEqual((await fastify.inject('/prefix/')).statusCode, 200)
})

test('prefixed root aliases are detected with duplicate slash normalization', async (t) => {
  const fastify = await build({
    routerOptions: { ignoreDuplicateSlashes: true }
  })
  t.after(() => fastify.close())

  await fastify.register(async function routes (fastify) {
    fastify.get('/', {
      config: { rateLimit: rateLimitConfig() }
    }, async () => 'ok')
  }, { prefix: '/prefix' })

  t.assert.strictEqual((await fastify.inject('/prefix')).statusCode, 200)
  t.assert.strictEqual((await fastify.inject({ method: 'HEAD', url: '/prefix/' })).statusCode, 429)
})

test('routes sharing a rate-limit config retain separate stores', async (t) => {
  const fastify = await build()
  t.after(() => fastify.close())

  const config = rateLimitConfig()
  const handler = async () => 'ok'

  fastify.get('/one', { config: { rateLimit: config } }, handler)
  fastify.get('/two', { config: { rateLimit: config } }, handler)

  t.assert.strictEqual((await fastify.inject('/one')).statusCode, 200)
  t.assert.strictEqual((await fastify.inject('/two')).statusCode, 200)
  t.assert.strictEqual((await fastify.inject({ method: 'HEAD', url: '/one' })).statusCode, 429)
  t.assert.strictEqual((await fastify.inject({ method: 'HEAD', url: '/two' })).statusCode, 429)
})

test('a pre-existing constrained HEAD does not interfere with generated siblings', async (t) => {
  const fastify = await build()
  t.after(() => fastify.close())

  const config = rateLimitConfig()
  const handler = async () => 'ok'
  const route = (method, version) => fastify.route({
    method,
    url: '/resource',
    constraints: { version },
    exposeHeadRoute: method === 'GET',
    config: { rateLimit: config },
    handler
  })

  route('HEAD', '1.0.0')
  route('GET', '1.0.0')
  route('GET', '2.0.0')

  const versionOne = { 'accept-version': '1.0.0' }
  const versionTwo = { 'accept-version': '2.0.0' }

  t.assert.strictEqual((await fastify.inject({ url: '/resource', headers: versionOne })).statusCode, 200)
  t.assert.strictEqual((await fastify.inject({ method: 'HEAD', url: '/resource', headers: versionOne })).statusCode, 200)
  t.assert.strictEqual((await fastify.inject({ url: '/resource', headers: versionTwo })).statusCode, 200)
  t.assert.strictEqual((await fastify.inject({ method: 'HEAD', url: '/resource', headers: versionTwo })).statusCode, 429)
})

test('an explicit HEAD route retains a separate store', async (t) => {
  const fastify = await build()
  t.after(() => fastify.close())

  const config = rateLimitConfig()
  const handler = async () => 'ok'

  fastify.get('/generated', { config: { rateLimit: config } }, handler)
  fastify.head('/explicit', { config: { rateLimit: config } }, handler)

  t.assert.strictEqual((await fastify.inject('/generated')).statusCode, 200)
  t.assert.strictEqual((await fastify.inject({ method: 'HEAD', url: '/explicit' })).statusCode, 200)
  t.assert.strictEqual((await fastify.inject({ method: 'HEAD', url: '/generated' })).statusCode, 429)
  t.assert.strictEqual((await fastify.inject({ method: 'HEAD', url: '/explicit' })).statusCode, 429)
})

test('per-route HEAD generation can be disabled without sharing explicit routes', async (t) => {
  const fastify = await build()
  t.after(() => fastify.close())

  const config = rateLimitConfig()
  const handler = async () => 'ok'

  fastify.head('/resource', { config: { rateLimit: config } }, handler)
  fastify.get('/resource', {
    exposeHeadRoute: false,
    config: { rateLimit: config }
  }, handler)

  t.assert.strictEqual((await fastify.inject('/resource')).statusCode, 200)
  t.assert.strictEqual((await fastify.inject({ method: 'HEAD', url: '/resource' })).statusCode, 200)
})

test('global HEAD generation can be disabled without sharing explicit routes', async (t) => {
  const fastify = await build({ exposeHeadRoutes: false })
  t.after(() => fastify.close())

  const config = rateLimitConfig()
  const handler = async () => 'ok'

  fastify.get('/resource', { config: { rateLimit: config } }, handler)
  fastify.head('/resource', { config: { rateLimit: config } }, handler)

  t.assert.strictEqual((await fastify.inject('/resource')).statusCode, 200)
  t.assert.strictEqual((await fastify.inject({ method: 'HEAD', url: '/resource' })).statusCode, 200)
})

test('an explicit GET and HEAD method array retains its own store', async (t) => {
  const fastify = await build()
  t.after(() => fastify.close())

  const config = rateLimitConfig()
  const handler = async () => 'ok'

  fastify.get('/generated', { config: { rateLimit: config } }, handler)
  fastify.route({
    method: ['GET', 'HEAD'],
    url: '/combined',
    config: { rateLimit: config },
    handler
  })

  t.assert.strictEqual((await fastify.inject('/generated')).statusCode, 200)
  t.assert.strictEqual((await fastify.inject('/combined')).statusCode, 200)
  t.assert.strictEqual((await fastify.inject({ method: 'HEAD', url: '/generated' })).statusCode, 429)
  t.assert.strictEqual((await fastify.inject({ method: 'HEAD', url: '/combined' })).statusCode, 429)
})

test('a multi-method GET route shares its generated HEAD store', async (t) => {
  const fastify = await build()
  t.after(() => fastify.close())

  fastify.route({
    method: ['GET', 'POST'],
    url: '/resource',
    config: {
      rateLimit: { max: 2, timeWindow: 60000 }
    },
    handler: async () => 'ok'
  })

  t.assert.strictEqual((await fastify.inject('/resource')).statusCode, 200)
  t.assert.strictEqual((await fastify.inject({ method: 'POST', url: '/resource' })).statusCode, 200)
  t.assert.strictEqual((await fastify.inject({ method: 'HEAD', url: '/resource' })).statusCode, 429)
})

test('generated HEAD matches equivalent cloned constraints', async (t) => {
  const fastify = Fastify()
  fastify.addHook('onRoute', function cloneConstraints (routeOptions) {
    if (routeOptions.constraints) {
      routeOptions.constraints = { ...routeOptions.constraints }
    }
  })
  await fastify.register(rateLimit, { global: false })
  t.after(() => fastify.close())

  fastify.get('/resource', {
    constraints: { version: '1.0.0' },
    config: { rateLimit: rateLimitConfig() }
  }, async () => 'ok')

  const headers = { 'accept-version': '1.0.0' }
  t.assert.strictEqual((await fastify.inject({ url: '/resource', headers })).statusCode, 200)
  t.assert.strictEqual((await fastify.inject({ method: 'HEAD', url: '/resource', headers })).statusCode, 429)
})

test('a custom store creates one child for a generated GET and HEAD pair', async (t) => {
  let children = 0

  function CustomStore (options) {
    this.options = options
    this.current = 0
  }

  CustomStore.prototype.incr = function (_key, callback) {
    this.current++
    callback(null, { current: this.current, ttl: this.options.timeWindow })
  }

  CustomStore.prototype.child = function (options) {
    children++
    return new CustomStore(options)
  }

  const fastify = Fastify()
  await fastify.register(rateLimit, { global: false, store: CustomStore })
  t.after(() => fastify.close())

  fastify.get('/one', {
    config: { rateLimit: rateLimitConfig() }
  }, async () => 'ok')
  fastify.get('/two', {
    config: { rateLimit: rateLimitConfig() }
  }, async () => 'ok')

  t.assert.strictEqual(children, 2)
  t.assert.strictEqual((await fastify.inject('/one')).statusCode, 200)
  t.assert.strictEqual((await fastify.inject({ method: 'HEAD', url: '/one' })).statusCode, 429)
})

test('generated HEAD does not reuse a store when an earlier hook changes its constraints', async (t) => {
  const fastify = Fastify()
  fastify.addHook('onRoute', function constrainHead (routeOptions) {
    if (routeOptions.method === 'HEAD') {
      routeOptions.constraints = { host: 'head.example' }
    }
  })
  await fastify.register(rateLimit, { global: false })
  t.after(() => fastify.close())

  fastify.get('/resource', {
    config: { rateLimit: rateLimitConfig() }
  }, async () => 'ok')

  t.assert.strictEqual((await fastify.inject('/resource')).statusCode, 200)
  t.assert.strictEqual((await fastify.inject({
    method: 'HEAD',
    url: '/resource',
    headers: { host: 'head.example' }
  })).statusCode, 200)
})

test('generated HEAD does not reuse a store when a later hook changes its constraints', async (t) => {
  const fastify = await build()
  fastify.addHook('onRoute', function constrainHead (routeOptions) {
    if (routeOptions.method === 'HEAD') {
      routeOptions.constraints = { host: 'head.example' }
    }
  })
  t.after(() => fastify.close())

  fastify.get('/resource', {
    config: { rateLimit: rateLimitConfig() }
  }, async () => 'ok')

  t.assert.strictEqual((await fastify.inject('/resource')).statusCode, 200)
  t.assert.strictEqual((await fastify.inject({
    method: 'HEAD',
    url: '/resource',
    headers: { host: 'head.example' }
  })).statusCode, 200)
})

test('generated HEAD does not reuse a store when a later hook mutates constraints', async (t) => {
  const fastify = await build()
  fastify.addHook('onRoute', function constrainHead (routeOptions) {
    if (routeOptions.method === 'HEAD') {
      routeOptions.constraints.host = 'head.example'
    }
  })
  t.after(() => fastify.close())

  fastify.get('/resource', {
    constraints: { host: 'get.example' },
    config: { rateLimit: rateLimitConfig() }
  }, async () => 'ok')

  t.assert.strictEqual((await fastify.inject({
    url: '/resource',
    headers: { host: 'get.example' }
  })).statusCode, 200)
  t.assert.strictEqual((await fastify.inject({
    method: 'HEAD',
    url: '/resource',
    headers: { host: 'head.example' }
  })).statusCode, 200)
})
