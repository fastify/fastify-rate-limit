'use strict'

const Module = require('node:module')
const { test } = require('node:test')

const ValkeyStore = require('../store/ValkeyStore')

function callStore (store, method, key, timeWindow, max) {
  return new Promise((resolve, reject) => {
    store[method](key, (err, result) => {
      err ? reject(err) : resolve(result)
    }, timeWindow, max)
  })
}

function createScripts () {
  return {
    increment: {},
    read: {}
  }
}

test('ValkeyStore adapts GLIDE script calls to the store contract', async (t) => {
  const scripts = createScripts()
  const invocations = []
  const client = {
    invokeScript: async (script, options) => {
      invocations.push({ script, options })
      return script === scripts.increment ? ['3', '4000'] : [2, 3500]
    }
  }
  const store = new ValkeyStore(true, false, client, 'prefix:', scripts)

  t.assert.deepStrictEqual(
    await callStore(store, 'incr', 'client', 4000, 2),
    { current: 3, ttl: 4000 }
  )
  t.assert.deepStrictEqual(invocations[0], {
    script: scripts.increment,
    options: {
      keys: ['prefix:client'],
      args: ['4000', '2', 'true', 'false']
    }
  })

  t.assert.deepStrictEqual(
    await callStore(store, 'read', 'client', 4000, 2),
    { current: 2, ttl: 3500 }
  )
  t.assert.deepStrictEqual(invocations[1], {
    script: scripts.read,
    options: { keys: ['prefix:client'] }
  })

  const child = store.child({
    continueExceeding: false,
    exponentialBackoff: true,
    routeInfo: { method: 'GET', url: '/limited' }
  })

  t.assert.strictEqual(child.valkey, client)
  t.assert.strictEqual(child.scripts, scripts)
  t.assert.strictEqual(child.key, 'prefix:GET/limited-')
  t.assert.strictEqual(child.continueExceeding, false)
  t.assert.strictEqual(child.exponentialBackoff, true)
})

test('ValkeyStore forwards GLIDE errors', async (t) => {
  const failure = new Error('boom')
  const scripts = createScripts()
  const store = new ValkeyStore(false, false, {
    invokeScript: async () => { throw failure }
  }, 'prefix:', scripts)

  await t.assert.rejects(
    callStore(store, 'incr', 'client', 1000, 2),
    failure
  )
})

test('ValkeyStore loads and shares GLIDE scripts lazily', (t) => {
  const failure = new Error('missing module')
  const originalLoad = Module._load

  Module._load = function (request, parent, isMain) {
    if (request === '@valkey/valkey-glide') {
      throw failure
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    t.assert.throws(
      () => new ValkeyStore(false, false, {}),
      (err) => {
        t.assert.match(err.message, /requires @valkey\/valkey-glide to be installed/)
        t.assert.strictEqual(err.cause, failure)
        return true
      }
    )

    Module._load = function (request, parent, isMain) {
      if (request === '@valkey/valkey-glide') {
        return { Script: class Script {} }
      }

      return originalLoad.call(this, request, parent, isMain)
    }

    const first = new ValkeyStore(false, false, {})
    const second = new ValkeyStore(false, false, {})

    t.assert.strictEqual(first.scripts, second.scripts)
  } finally {
    Module._load = originalLoad
  }
})
