'use strict'

/**
 *
 * @param {number} bps
 * @returns
 */
function bpsToBpsFn (bps) {
  return function bpsFn (elapsedTime, bytes) {
    return bps
  }
}

module.exports = {
  bpsToBpsFn
}
