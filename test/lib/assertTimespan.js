'use strict'

/**
 * @param {*} t
 * @param {number} start
 * @param {number} end
 * @param {number} expected
 * @param {number} [tolerance=15]
 */
function assertTimespan (t, start, end, expected, tolerance = 5) {
  const diff = end - start
  const delta = Math.abs(expected - diff)
  t.ok(delta <= (expected / 100 * tolerance), 'tolerance of ' + tolerance + '%, got ' + delta + 'ms')
}

module.exports = {
  assertTimespan
}
