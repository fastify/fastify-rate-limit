'use strict'

/**
 * Generic thunk-based "trampoline" helper function.
 *
 * @param {Function} fn function
 * @return {Function} "trampolined" function
 */

function trampoline (fn) {
  return function () {
    let result = fn.apply(this, arguments)

    while (typeof result === 'function') {
      result = result()
    }

    return result
  }
}

module.exports = { trampoline }
