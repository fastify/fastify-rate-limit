'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const rateLimit = require('../index')

const { normalizeIP } = rateLimit

async function buildServer (options) {
  const fastify = Fastify({ trustProxy: true })
  await fastify.register(rateLimit, Object.assign({
    max: 1,
    timeWindow: 10000
  }, options))

  fastify.get('/', async () => 'ok')

  return fastify
}

function requestFrom (ip) {
  return {
    url: '/',
    headers: {
      'x-forwarded-for': ip
    }
  }
}

test('normalizeIP canonicalizes IP address strings', (t) => {
  t.plan(7)

  t.assert.deepStrictEqual(normalizeIP('127.0.0.1'), '127.0.0.1')
  t.assert.deepStrictEqual(normalizeIP('Example.COM'), 'example.com')
  t.assert.deepStrictEqual(normalizeIP('::ffff:192.0.2.1'), '192.0.2.1')
  t.assert.deepStrictEqual(normalizeIP('::ffff:c000:0201'), '192.0.2.1')
  t.assert.deepStrictEqual(normalizeIP('2001:0DB8:ABCD:0012:0000:0000:0000:0001'), '2001:db8:abcd:12::')
  t.assert.deepStrictEqual(normalizeIP('2001:db8:abcd:12::1', 48), '2001:db8:abcd::')
  t.assert.deepStrictEqual(normalizeIP('2001:db8:abcd:12::1', 128), '2001:db8:abcd:12::1')
})

test('default keyGenerator masks trusted IPv6 clients to /64', async (t) => {
  t.plan(3)

  const fastify = await buildServer()
  t.after(() => fastify.close())

  let res = await fastify.inject(requestFrom('2001:0DB8:ABCD:0012:0000:0000:0000:0001'))
  t.assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject(requestFrom('2001:db8:abcd:12::2'))
  t.assert.deepStrictEqual(res.statusCode, 429)

  res = await fastify.inject(requestFrom('2001:db8:abcd:13::1'))
  t.assert.deepStrictEqual(res.statusCode, 200)
})

test('default keyGenerator uses configured ipv6Subnet', async (t) => {
  t.plan(2)

  const fastify = await buildServer({ ipv6Subnet: 48 })
  t.after(() => fastify.close())

  let res = await fastify.inject(requestFrom('2001:db8:abcd:12::1'))
  t.assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject(requestFrom('2001:db8:abcd:13::1'))
  t.assert.deepStrictEqual(res.statusCode, 429)
})

test('invalid ipv6Subnet values fall back to /64', async (t) => {
  t.plan(4)

  let fastify = await buildServer({ ipv6Subnet: -1 })
  t.after(() => fastify.close())

  let res = await fastify.inject(requestFrom('2001:db8:abcd:12::1'))
  t.assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject(requestFrom('2001:db8:abcd:13::1'))
  t.assert.deepStrictEqual(res.statusCode, 200)

  fastify = await buildServer({ ipv6Subnet: 129 })
  t.after(() => fastify.close())

  res = await fastify.inject(requestFrom('2001:db8:abcd:12::1'))
  t.assert.deepStrictEqual(res.statusCode, 200)

  res = await fastify.inject(requestFrom('2001:db8:abcd:13::1'))
  t.assert.deepStrictEqual(res.statusCode, 200)
})
