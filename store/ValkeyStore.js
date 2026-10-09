'use strict'

const lua = require('./lua')

// GLIDE stores script sources in a native registry. Keep the two fixed scripts
// alive for this module's lifetime so every store can recover from cache misses.
let sharedScripts

function createScripts () {
  let Script

  try {
    Script = require('@valkey/valkey-glide').Script
  } catch (cause) {
    throw new Error('Valkey support requires @valkey/valkey-glide to be installed', { cause })
  }

  return {
    increment: new Script(lua.increment),
    read: new Script(lua.read)
  }
}

function getScripts () {
  if (!sharedScripts) {
    sharedScripts = createScripts()
  }

  return sharedScripts
}

function invokeScript (valkey, script, options, cb) {
  valkey.invokeScript(script, options).then((result) => {
    cb(null, { current: Number(result[0]), ttl: Number(result[1]) })
  }, (err) => {
    cb(err, null)
  })
}

function ValkeyStore (continueExceeding, exponentialBackoff, valkey, key = 'fastify-rate-limit-', scripts = getScripts()) {
  this.continueExceeding = continueExceeding
  this.exponentialBackoff = exponentialBackoff
  this.valkey = valkey
  this.key = key
  this.scripts = scripts
}

ValkeyStore.prototype.incr = function (ip, cb, timeWindow, max) {
  invokeScript(this.valkey, this.scripts.increment, {
    keys: [this.key + ip],
    args: [String(timeWindow), String(max), String(this.continueExceeding), String(this.exponentialBackoff)]
  }, cb)
}

ValkeyStore.prototype.read = function (ip, cb, timeWindow, max) {
  invokeScript(this.valkey, this.scripts.read, {
    keys: [this.key + ip]
  }, cb)
}

ValkeyStore.prototype.child = function (routeOptions) {
  return new ValkeyStore(routeOptions.continueExceeding, routeOptions.exponentialBackoff, this.valkey, `${this.key}${routeOptions.routeInfo.method}${routeOptions.routeInfo.url}-`, this.scripts)
}

module.exports = ValkeyStore
