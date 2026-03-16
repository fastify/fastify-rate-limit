'use strict'

const { test } = require('node:test')

const ValkeyStore = require('../store/ValkeyStore')

test('ValkeyStore invokes script with prefixed key and string args', async (t) => {
  t.plan(8)

  class FakeScript {
    constructor (source) {
      this.source = source
    }
  }

  let receivedScript = null
  let receivedOptions = null

  ValkeyStore.Script = FakeScript

  const client = {
    invokeScript: async (script, options) => {
      receivedScript = script
      receivedOptions = options
      return ['3', '4000']
    }
  }

  const store = new ValkeyStore(true, false, client, 'prefix:')

  await new Promise((resolve, reject) => {
    store.incr('127.0.0.1', (err, result) => {
      try {
        t.assert.ifError(err)
        t.assert.ok(receivedScript instanceof FakeScript)
        t.assert.match(receivedScript.source, /redis\.call\('INCR', key\)/)
        t.assert.deepStrictEqual(receivedOptions.keys, ['prefix:127.0.0.1'])
        t.assert.deepStrictEqual(receivedOptions.args, ['4000', '2', 'true', 'false'])
        t.assert.deepStrictEqual(result, { current: 3, ttl: 4000 })
        t.assert.strictEqual(store.valkey, client)
        t.assert.strictEqual(store.key, 'prefix:')
        resolve()
      } catch (assertErr) {
        reject(assertErr)
      }
    }, 4000, 2)
  })

  ValkeyStore.Script = null
})

test('ValkeyStore child keeps client and adds route prefix', (t) => {
  t.plan(4)

  class FakeScript {
    constructor (source) {
      this.source = source
    }
  }

  const client = {
    invokeScript: async () => ['1', '1000']
  }

  ValkeyStore.Script = FakeScript

  const store = new ValkeyStore(false, true, client, 'root:')
  const child = store.child({
    continueExceeding: true,
    exponentialBackoff: false,
    routeInfo: {
      method: 'GET',
      url: '/limited'
    }
  })

  t.assert.strictEqual(child.valkey, client)
  t.assert.strictEqual(child.key, 'root:GET/limited-')
  t.assert.strictEqual(child.continueExceeding, true)
  t.assert.strictEqual(child.exponentialBackoff, false)

  ValkeyStore.Script = null
})

test('ValkeyStore reuses the cached script instance', (t) => {
  t.plan(2)

  let constructorCalls = 0

  class FakeScript {
    constructor (source) {
      constructorCalls++
      this.source = source
    }
  }

  const client = {
    invokeScript: async () => ['1', '1000']
  }

  ValkeyStore.Script = FakeScript

  const first = new ValkeyStore(false, false, client)
  const second = new ValkeyStore(true, true, client)

  t.assert.strictEqual(constructorCalls, 1)
  t.assert.strictEqual(first.script, second.script)

  ValkeyStore.Script = null
})

test('ValkeyStore forwards invokeScript errors', async (t) => {
  t.plan(2)

  class FakeScript {
    constructor (source) {
      this.source = source
    }
  }

  const failure = new Error('boom')

  ValkeyStore.Script = FakeScript

  const store = new ValkeyStore(false, false, {
    invokeScript: async () => {
      throw failure
    }
  })

  await new Promise((resolve, reject) => {
    store.incr('127.0.0.1', (err, result) => {
      try {
        t.assert.strictEqual(err, failure)
        t.assert.strictEqual(result, null)
        resolve()
      } catch (assertErr) {
        reject(assertErr)
      }
    }, 1000, 2)
  })

  ValkeyStore.Script = null
})
