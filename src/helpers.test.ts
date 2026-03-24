import { describe, it } from 'node:test'
import { strict as assert } from 'node:assert'

import { randomNumber, randomString, diffStats, wait } from './helpers.js'

describe('randomString', () => {
  it('generates a string of the specified length', () => {
    const length = 10
    const result = randomString(length)
    assert.equal(result.length, length)
  })

  it('generates a string with default length of 5 when length is not provided', () => {
    const result = randomString()
    assert.equal(result.length, 5)
  })

  it('generates different strings on multiple calls', () => {
    const str1 = randomString(20)
    const str2 = randomString(20)
    assert.notEqual(str1, str2)
  })

  it('includes numbers when withnumbers is true (default)', () => {
    const result = randomString(100, true)
    const hasNumbers = /\d/.test(result)
    assert.equal(true, hasNumbers)
  })

  it('excludes numbers when withnumbers is false', () => {
    const result = randomString(100, false)
    const hasNumbers = /\d/.test(result)
    assert.equal(false, hasNumbers)
  })

  it('only contains valid characters', () => {
    const result = randomString(50, true)
    const validPattern = /^[A-Za-z0-9]+$/
    assert.equal(true, validPattern.test(result))
  })

  it('generates a string with letters only when withnumbers is false', () => {
    const result = randomString(50, false)
    const validPattern = /^[A-Za-z]+$/
    assert.equal(true, validPattern.test(result))
  })
})

describe('randomNumber', () => {
  it('generates a number within the specified range', () => {
    const max = 100
    const result = randomNumber(max)
    assert.equal(true, result >= 0 && result <= max)
  })

  it('can return 0', () => {
    // Test multiple times to increase chance of getting 0
    let hasZero = false
    for (let i = 0; i < 100; i++) {
      if (randomNumber(10) === 0) {
        hasZero = true
        break
      }
    }
    assert.equal(true, hasZero)
  })

  it('can return the max value', () => {
    const max = 5
    let hasMax = false
    for (let i = 0; i < 100; i++) {
      if (randomNumber(max) === max) {
        hasMax = true
        break
      }
    }
    assert.equal(true, hasMax)
  })

  it('returns an integer', () => {
    const result = randomNumber(100)
    assert.equal(result, Math.floor(result))
  })

  it('generates different numbers on multiple calls', () => {
    const num1 = randomNumber(10000)
    const num2 = randomNumber(10000)
    // High probability they're different
    assert.notEqual(num1, num2)
  })
})

describe('diffStats', () => {
  it('subtracts all values in objB from objA', () => {
    const objA = { a: 100, b: 50, c: 25 }
    const objB = { a: 30, b: 10, c: 5 }
    const result = diffStats(objA, objB)
    assert.deepEqual(result, { a: 70, b: 40, c: 20 })
  })

  it('handles negative results', () => {
    const objA = { a: 10, b: 20 }
    const objB = { a: 30, b: 50 }
    const result = diffStats(objA, objB)
    assert.deepEqual(result, { a: -20, b: -30 })
  })

  it('handles zero differences', () => {
    const objA = { a: 100, b: 50 }
    const objB = { a: 100, b: 50 }
    const result = diffStats(objA, objB)
    assert.deepEqual(result, { a: 0, b: 0 })
  })

  it('preserves object A without modifying it', () => {
    const objA = { x: 100, y: 200 }
    const objACopy = { x: 100, y: 200 }
    const objB = { x: 30, y: 50 }
    const _result = diffStats(objA, objB)
    assert.deepEqual(objA, objACopy)
  })

  it('works with large numbers', () => {
    const objA = { a: 1000000, b: 5000000 }
    const objB = { a: 100000, b: 500000 }
    const result = diffStats(objA, objB)
    assert.deepEqual(result, { a: 900000, b: 4500000 })
  })

  it('handles multiple keys', () => {
    const objA = { a: 10, b: 20, c: 30, d: 40, e: 50 }
    const objB = { a: 1, b: 2, c: 3, d: 4, e: 5 }
    const result = diffStats(objA, objB)
    assert.deepEqual(result, { a: 9, b: 18, c: 27, d: 36, e: 45 })
  })
})

describe('wait', () => {
  it('resolves after the specified milliseconds', async () => {
    const start = Date.now()
    await wait(100)
    const elapsed = Date.now() - start
    // Allow some tolerance (±50ms)
    assert.equal(true, elapsed >= 50 && elapsed <= 200)
  })

  it('returns a Promise', () => {
    const result = wait(10)
    assert.equal(true, result instanceof Promise)
  })

  it('resolves with undefined', async () => {
    const result = await wait(10)
    assert.equal(result, undefined)
  })

  it('can be used with multiple awaits', async () => {
    const start = Date.now()
    await wait(50)
    await wait(50)
    const elapsed = Date.now() - start
    // Total time should be ~100ms
    assert.equal(true, elapsed >= 80)
  })

  it('waits for zero milliseconds', async () => {
    const result = await wait(0)
    assert.equal(result, undefined)
  })
})
