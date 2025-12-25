import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { beforeEach, describe, it, before, after } from 'node:test'

import clone from '@markusberg/clone'

import nodeCache from './node-cache.js'
import { randomNumber, randomString, diffKeys, wait } from './helpers.js'

import type { Key, ValueSetItem } from './interfaces.js'

const pkg = JSON.parse(readFileSync('package.json').toString())

let localCache: any = new nodeCache({ stdTTL: 0 })

// let BENCH = {}

// just for testing disable the check period
localCache.close()

describe(`\`${pkg.name}@${pkg.version}\` on \`node@${process.version}\``, () => {
  // after(() => {
  //   let txt = `Benchmark node@${process.version}:`
  //   for (const type in BENCH) {
  //     const ops = BENCH[type]
  //     txt += `\n   - ${type}: ${ops.toFixed(1)} ops/s`
  //   }
  //   console.log(txt)
  // })

  describe('general sync-style', () => {
    let state: Record<string, any>
    let localCache: nodeCache<
      string | number | object | Promise<unknown> | Map<unknown, unknown>
    >

    before(() => {
      localCache = new nodeCache({ stdTTL: 0 })
      state = {
        start: clone(localCache.getStats()),
        value: randomString(100),
        value2: randomString(100),
        value3: randomString(100),
        key: randomString(10),
        obj: {
          a: 1,
          b: {
            x: 2,
            y: 3,
          },
        },
        otp: randomString(10),
      }
    })
    after(() => {
      localCache.close()
    })
    it('set key', () => {
      const res = localCache.set(state.key, state.value, 0)
      assert.equal(true, res)
      assert.equal(1, localCache.getStats().keys - state.start.keys)
    })
    it('get key', () => {
      const res = localCache.get(state.key)
      assert.equal(state.value, res)
    })
    it('get key names', () => {
      const res = localCache.keys()
      assert.deepEqual(res, [state.key])
    })
    it('has key', () => {
      const res = localCache.has(state.key)
      assert.equal(true, res)
    })
    it('does not have key', () => {
      const res = localCache.has('non existing key')
      assert.equal(false, res)
    })
    it('delete an undefined key', () => {
      const count = localCache.del('xxx')
      assert.equal(0, count)
    })
    it('take key', () => {
      // make sure we are starting fresh
      const testKey = 'otp'
      const testValue = 'some other value'
      assert.equal(false, localCache.has(testKey))

      // taking a non-exitent value should be fine
      assert.equal(undefined, localCache.take(testKey))

      // check if otp insertion suceeded
      assert.equal(true, localCache.set(testKey, state.otp, 0))
      // are we able to check the presence of the key?

      assert.equal(true, localCache.has(testKey))

      // not once, but twice?
      // This proves that keys can be accessed as many times as required, but
      // not the value. The `take()` method makes the values as single-read, not the keys.
      assert.equal(true, localCache.has(testKey))

      // take the value
      assert.equal(state.otp, localCache.take(testKey))

      // key should not be present anymore once the value is read
      assert.equal(false, localCache.has(testKey))

      // and, re-insertions are not probhitied
      assert.equal(true, localCache.set(testKey, testValue))

      // should be able take the value again
      assert.equal(testValue, localCache.take(testKey))

      // key should not be present anymore, again
      assert.equal(false, localCache.has(testKey))
    })
    it('take key with falsy values', () => {
      // make sure we are starting fresh
      const testKey = 'otp'
      assert.equal(false, localCache.has(testKey))

      // insert a falsy value and take it
      assert.equal(true, localCache.set(testKey, 0))

      assert.equal(0, localCache.take(testKey))

      // key should not exist anymore
      assert.equal(false, localCache.has(testKey))
    })
    it('update key (and get it to check if the update worked)', () => {
      assert.equal(true, localCache.set(state.key, state.value2, 0))

      // check if the update worked
      assert.equal(state.value2, localCache.get(state.key))

      // stats should not have changed
      assert.equal(1, localCache.getStats().keys - state.start.keys)
    })
    it('delete the defined key', () => {
      localCache.once('del', (key: unknown, val: unknown) => {
        assert.equal(state.key, key)
        assert.equal(state.value2, val)
      })
      const count = localCache.del(state.key)
      assert.equal(1, count)
      // check stats
      assert.equal(0, localCache.getStats().keys - state.start.keys)
    })
    it('delete multiple keys (after setting them)', () => {
      const keys = ['multiA', 'multiB', 'multiC']

      // set the keys
      for (const key of keys) {
        const res = localCache.set(key, state.value3)
        assert.equal(true, res)
      }

      // check the keys
      for (const key of keys) {
        const res = localCache.get(key)
        assert.equal(state.value3, res)
      }

      // delete 2 of those keys
      assert.equal(2, localCache.del(keys.slice(0, 2)))

      // try to get the deleted keys
      for (const key of keys.slice(0, 2)) {
        assert.equal(undefined, localCache.get(key))
      }

      // get the not deleted key
      assert.equal(state.value3, localCache.get(keys[2]))

      // delete this key, too
      assert.equal(1, localCache.del(keys[2]))

      // try get the deleted key
      assert.equal(undefined, localCache.get(keys[2]))

      // re-deleting the keys should not have to delete an actual key
      assert.equal(0, localCache.del(keys))
    })
    it('set a key to 0', () => {
      const res = localCache.set('zero', 0)
      assert.equal(true, res)
    })
    it('get previously set key', () => {
      const res = localCache.get('zero')
      assert.equal(0, res)
    })
    it('set a key to an object clone', () => {
      const res = localCache.set('clone', state.obj)
      assert.equal(true, res)
    })
    it('get cloned object', () => {
      const res = localCache.get('clone')
      // should not be === equal
      assert.notEqual(state.obj, res)

      // but should deep equal
      assert.deepEqual(state.obj, res)
      ;(res as any).b.y = 42
      const res2 = localCache.get('clone')
      assert.deepEqual(state.obj, res2)
    })
    it('test promise storage (fulfill before adding to cache)', async () => {
      const deferred_value = 'Some deferred value'
      const p = new Promise((fulfill, _reject) => {
        fulfill(deferred_value)
      })
      p.then((value) => {
        assert.equal(deferred_value, value)
      })
      localCache.set('promise', p)
      const q = localCache.get('promise')
      await q
    })

    it('test promise storage (fulfill after adding to cache)', async () => {
      const deferred_value = 'Some deferred value'
      let called = 0
      const callStub = () => {
        called++
      }
      const p = new Promise((fulfill, _reject) => {
        setTimeout(() => fulfill(deferred_value), 250)
      })
      p.then((value) => {
        assert.equal(deferred_value, value)
        callStub()
      })
      localCache.set('promise', p)
      const q = localCache.get('promise')
      assert.equal(true, q instanceof Promise)
      ;(q as Promise<string>).then((value) => {
        assert.equal(deferred_value, value)
        callStub()
      })
      await q
      assert.equal(2, called)
    })
    it('test es6 map', () => {
      const testKey = randomString(10)
      const map = new Map([
        ['firstkey', 'firstvalue'],
        ['2ndkey', '2ndvalue'],
        ['thirdkey', 'thirdvalue'],
      ])
      localCache.set(testKey, map)
      map.set('fourthkey', 'fourthvalue')
      const cached_map = localCache.get(testKey) as Map<string, string>
      assert.equal(cached_map.get('2ndkey'), '2ndvalue')
      assert.equal(cached_map.get('fourthkey'), undefined)
    })
    it('test `useClones = true` with an Object', () => {
      const testKey = randomString(10)
      const value = {
        a: 123,
        b: 456,
      }
      const c = 789
      localCache.set(testKey, value)
      value.a = c
      assert.notEqual(value, localCache.get(testKey))
    })

    it('test `useClones = false` with an Object', () => {
      const localCacheNoClone = new nodeCache({
        stdTTL: 0,
        useClones: false,
        checkperiod: 0,
      })

      const testKey = randomString(10)
      const value = {
        a: 123,
        b: 456,
      }
      const c = 789
      localCacheNoClone.set(testKey, value)
      value.a = c
      assert.equal(value, localCacheNoClone.get(testKey))
    })
  })

  describe('max key amount', () => {
    let state: Record<string, string>
    const localCacheMaxKeys = new nodeCache({ maxKeys: 2 })

    before(() => {
      state = {
        key1: randomString(10),
        key2: randomString(10),
        key3: randomString(10),
        value1: randomString(10),
        value2: randomString(10),
        value3: randomString(10),
      }
    })
    it('exceed max key size', () => {
      const setKey = localCacheMaxKeys.set(state.key1, state.value1, 0)
      assert.equal(true, setKey)
      const setKey2 = localCacheMaxKeys.set(state.key2, state.value2, 0)
      assert.equal(true, setKey2)
      assert.throws(() => localCacheMaxKeys.set(state.key3, state.value3, 0), {
        name: 'ECACHEFULL',
        message: 'Cache max keys amount exceeded',
      })
    })
    it('remove a key and set another one', () => {
      const del = localCacheMaxKeys.del(state.key1)
      assert.equal(1, del)
      const setKey3 = localCacheMaxKeys.set(state.key3, state.value3, 0)
      assert.equal(true, setKey3)
    })
  })
  describe('correct and incorrect key types', () => {
    describe('number', () => {
      let state: Record<string, any>
      before(() => {
        state = {
          keys: [],
          val: randomString(20),
        }
        for (let j = 1; j <= 10; j++) {
          state.keys.push(randomNumber(100000))
        }
      })
      it('set', () => {
        for (const key of state.keys) {
          const res = localCache.set(key, state.val)
          assert.equal(true, res)
        }
      })
      it('get', () => {
        const res = localCache.get(state.keys[0])
        assert.equal(state.val, res)
      })
      it('mget', () => {
        const res = localCache.mget(state.keys.slice(0, 2))

        // generate prediction
        const prediction: Record<string, string> = {}
        prediction[state.keys[0]] = state.val
        prediction[state.keys[1]] = state.val
        assert.deepEqual(prediction, res)
      })
      it('del single', () => {
        const count = localCache.del(state.keys[0])
        assert.equal(1, count)
      })
      it('del multi', () => {
        const count = localCache.del(state.keys.slice(1, 3))
        assert.equal(2, count)
      })
      it('ttl', async () => {
        const success = localCache.ttl(state.keys[3], 0.3)
        assert.equal(true, success)
        assert.equal(state.val, localCache.get(state.keys[3]))
        await wait(400)
        assert.equal(undefined, localCache.get(state.keys[3]))
      })
      it('getTtl', () => {
        const now = Date.now()
        const success = localCache.ttl(state.keys[4], 0.5)
        assert.equal(true, success)
        const ttl = localCache.getTtl(state.keys[4])
        const ref = ttl - now
        assert.equal(true, 485 < ref)
        assert.equal(true, ref < 510)
      })
      after(() => {
        localCache.flushAll(false)
      })
    })
    describe('string', () => {
      let state: Record<string, any>

      before(() => {
        state = {
          keys: [],
          val: randomString(20),
        }
        for (let j = 1; j <= 10; j++) {
          state.keys.push(randomString(10))
        }
      })
      it('set', () => {
        for (const key of state.keys) {
          const res = localCache.set(key, state.val)
          assert.equal(true, res)
        }
      })
      it('get', () => {
        const res = localCache.get(state.keys[0])
        assert.equal(state.val, res)
      })
      it('mget', () => {
        const res = localCache.mget(state.keys.slice(0, 2))
        // generate prediction
        const prediction: Record<string, string> = {}
        prediction[state.keys[0]] = state.val
        prediction[state.keys[1]] = state.val
        assert.deepEqual(prediction, res)
      })
      it('del single', () => {
        const count = localCache.del(state.keys[0])
        assert.equal(1, count)
      })
      it('del multi', () => {
        const count = localCache.del(state.keys.slice(1, 3))
        assert.equal(2, count)
      })
      it('ttl', async () => {
        const success = localCache.ttl(state.keys[3], 0.3)
        assert.equal(true, success)
        const res = localCache.get(state.keys[3])
        assert.equal(state.val, res)
        await wait(400)
        assert.equal(undefined, localCache.get(state.keys[3]))
      })
      it('getTtl', () => {
        const now = Date.now()
        const success = localCache.ttl(state.keys[4], 0.5)
        assert.equal(true, success)
        const ttl = localCache.getTtl(state.keys[4])
        const ref = ttl - now
        assert.equal(true, 485 < ref)
        assert.equal(true, ref < 510)
      })
    })
    describe('boolean - invalid type', () => {
      let state: { keys: boolean[]; val: string }

      before(() => {
        state = {
          keys: [true, false],
          val: randomString(20),
        }
      })
      it('set sync-style', () => {
        assert.throws(() => localCache.set(state.keys[0], state.val), {
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `boolean`',
        })
      })
      it('get sync-style', () => {
        assert.throws(() => localCache.get(state.keys[0]), {
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `boolean`',
        })
      })
      it('mget sync-style', () => {
        assert.throws(() => localCache.mget(state.keys), {
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `boolean`',
        })
      })
      it('del single sync-style', () => {
        assert.throws(() => localCache.del(state.keys[0]), {
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `boolean`',
        })
      })
      it('del multi sync-style', () => {
        assert.throws(() => localCache.del(state.keys), {
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `boolean`',
        })
      })
      it('ttl sync-style', () => {
        assert.throws(() => localCache.ttl(state.keys[0], 10), {
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `boolean`',
        })
      })
      return it('getTtl sync-style', () => {
        assert.throws(() => localCache.getTtl(state.keys[0]), {
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `boolean`',
        })
      })
    })
    describe('object - invalid type', () => {
      let state: { keys: object[]; val: string }

      before(() => {
        state = {
          keys: [{ a: 1 }, { b: 2 }],
          val: randomString(20),
        }
      })
      it('set sync-style', () => {
        assert.throws(() => localCache.set(state.keys[0], state.val), {
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `object`',
        })
      })
      it('get sync-style', () => {
        assert.throws(() => localCache.get(state.keys[0]), {
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `object`',
        })
      })
      it('mget sync-style', () => {
        assert.throws(() => localCache.mget(state.keys), {
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `object`',
        })
      })
      it('del single sync-style', () => {
        assert.throws(() => localCache.del(state.keys[0]), {
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `object`',
        })
      })
      it('del multi sync-style', () => {
        assert.throws(() => localCache.del(state.keys), {
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `object`',
        })
      })
      it('ttl sync-style', () => {
        assert.throws(() => localCache.ttl(state.keys[0], 10), {
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `object`',
        })
      })
      it('getTtl sync-style', () => {
        assert.throws(() => localCache.getTtl(state.keys[0]), {
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `object`',
        })
      })
    })
  })
  describe('flush', () => {
    let state: {
      n: number
      count: number
      startKeys: number
      keys: Key[]
      val: string
    }

    before(() => {
      state = {
        n: 0,
        count: 100,
        startKeys: localCache.getStats().keys,
        keys: [],
        val: randomString(20),
      }
    })
    it('set keys', () => {
      for (let j = 0; j < state.count; j++) {
        const key = randomString(7)
        state.keys.push(key)
        localCache.set(key)
        state.n++
      }
      assert.equal(state.count, state.n)
      assert.equal(state.startKeys + state.count, localCache.getStats().keys)
    })
    it('flush keys', () => {
      localCache.flushAll(false)
      assert.equal(0, localCache.getStats().keys)
      assert.deepEqual({}, localCache.data)
    })
  })
  describe('flushStats', () => {
    let cache: nodeCache<string>
    before(() => {
      cache = new nodeCache()
    })
    it('set cache and flush stats value', () => {
      const key = randomString(10)
      const value = randomString(10)
      const res = cache.set(key, value)
      assert.equal(true, res)
      assert.equal(1, cache.getStats().keys)
      cache.flushStats()
      assert.equal(0, cache.getStats().keys)
      cache.get(key)
      assert.equal(1, cache.getStats().hits)
      cache.get(randomString(10))
      assert.equal(1, cache.getStats().misses)
    })
  })
  describe('many', () => {
    let state: { n: number; count: number; keys: Key[]; val: string }
    return before(() => {
      state = {
        n: 0,
        count: 100000,
        keys: [],
        val: randomString(20),
      }
      for (let i = 0; i < state.count; i++) {
        const key = randomString(7)
        state.keys.push(key)
      }
    })
  })
  describe('delete', () => {
    let state: Record<string, any>

    before(() => {
      state = {
        n: 0,
        count: 100000,
        keys: [],
        val: randomString(20),
      }
      for (let j = 0; j < state.count; j++) {
        const key = randomString(7)
        state.keys.push(key)
        localCache.set(key, state.val)
      }
    })

    it('delete all previously set keys', () => {
      for (let i = 0; i < state.count; i++) {
        assert.equal(1, localCache.del(state.keys[i]))
        state.n++
      }
      assert.equal(state.n, state.count)
      assert.equal(0, localCache.getStats().keys)
    })

    it('delete keys again; should not delete anything', () => {
      for (let i = 0; i < state.count; i++) {
        assert.equal(0, localCache.del(state.keys[i]))
        state.n++
      }
      assert.equal(state.n, state.count * 2)
      assert.equal(0, localCache.getStats().keys)
    })
  })
  describe('stats', () => {
    let state: Record<string, any>

    before(() => {
      state = {
        n: 0,
        start: clone(localCache.getStats()),
        count: 5,
        keylength: 7,
        valuelength: 50,
        keys: [],
        values: [],
      }
      for (let i = 0; i < state.count * 2; i++) {
        const key = randomString(state.keylength)
        const value = randomString(state.valuelength)
        state.keys.push(key)
        state.values.push(value)
        assert.equal(true, localCache.set(key, value, 0))
        state.n++
      }
    })
    it('get and remove `count` elements', () => {
      for (let i = 0; i < state.count; i++) {
        assert.equal(state.values[i], localCache.get(state.keys[i]))
        state.n++
      }
      for (let i = 0; i < state.count; i++) {
        assert.equal(1, localCache.del(state.keys[i]))
        state.n++
      }
      const after = localCache.getStats()
      const diff = diffKeys(after, state.start)
      assert.equal(diff.hits, 5)
      assert.equal(diff.keys, 5)
      assert.equal(diff.ksize, state.count * state.keylength)
      assert.equal(diff.vsize, state.count * state.valuelength)
    })
    it('generate `count` misses', () => {
      for (let i = 0; i < state.count; i++) {
        // 4 char key should not exist
        assert.equal(undefined, localCache.get('xxxx'))
        state.n++
      }
      const after = localCache.getStats()
      const diff = diffKeys(after, state.start)
      assert.equal(diff.misses, 5)
    })
    it('check successful runs', () => {
      assert.equal(state.n, 5 * state.count)
    })
  })
  describe('multi', () => {
    let state: Record<string, any>

    before(() => {
      state = {
        n: 0,
        count: 100,
        startKeys: localCache.getStats().keys,
        value: randomString(20),
        keys: [],
      }
      for (let i = 0; i < state.count; i++) {
        const key = randomString(7)
        state.keys.push(key)
      }
      for (const key of state.keys) {
        localCache.set(key, state.value, 0)
        state.n++
      }
    })
    it('generate a sub-list of keys', () => {
      state.getKeys = state.keys.splice(50, 5)
    })
    it('generate prediction', () => {
      state.prediction = {}
      for (const key of state.getKeys) {
        state.prediction[key] = state.value
      }
    })
    it('try to mget with a single key', () => {
      assert.throws(() => localCache.mget(state.getKeys[0]), {
        name: 'EKEYSTYPE',
        message: 'The keys argument has to be an array.',
      })
      state.n++
    })
    it('mget the sub-list', () => {
      assert.deepEqual(state.prediction, localCache.mget(state.getKeys))
      state.n++
    })
    it('delete keys in the sub-list', () => {
      assert.equal(state.getKeys.length, localCache.del(state.getKeys))
      state.n++
    })
    it('try to mget the sub-list again', () => {
      assert.deepEqual({}, localCache.mget(state.getKeys))
      state.n++
    })
    it('check successful runs', () => {
      assert.equal(state.n, state.count + 4)
    })
  })
  describe('ttl', () => {
    let state: Record<string, any>
    let localCacheTTL: nodeCache<string>

    before(() => {
      localCacheTTL = new nodeCache({
        stdTTL: 0.3,
        checkperiod: 0,
      })

      state = {
        n: 0,
        val: randomString(20),
        key1: `k1_${randomString(20)}`,
        key2: `k2_${randomString(20)}`,
        key3: `k3_${randomString(20)}`,
        key4: `k4_${randomString(20)}`,
        key5: `k5_${randomString(20)}`,
        key6: `k6_${randomString(20)}`,
        now: Date.now(),
      }
      state.keys = [state.key1, state.key2, state.key3, state.key4, state.key5]
    })
    describe('has validates expired ttl', () => {
      it('set a key with ttl', () => {
        assert.equal(true, localCacheTTL.set(state.key6, state.val, 0.7))
      })
      it('check this key immediately', () => {
        assert.equal(true, localCacheTTL.has(state.key6))
      })
      it('before it times out', async () => {
        await wait(20)
        state.n++
        const res = localCacheTTL.has(state.key6)
        assert.equal(true, res)
        assert.equal(state.val, localCacheTTL.get(state.key6))
      })
      return it('and after it timed out', async () => {
        await wait(800)
        const res = localCacheTTL.has(state.key6)
        assert.equal(false, res)
        state.n++
        assert.equal(undefined, localCacheTTL.get(state.key6))
      })
    })
    it('set a key with ttl', () => {
      const res = localCache.set(state.key1, state.val, 0.7)
      assert.equal(true, res)
      const ts = localCache.getTtl(state.key1)
      assert.equal(false, state.now < ts && ts < state.now + 300)
    })
    it('check this key immediately', () => {
      assert.equal(state.val, localCache.get(state.key1))
    })
    it('before it times out', async () => {
      await wait(20)
      state.n++
      const res = localCache.has(state.key1)
      assert.equal(true, res)
      assert.equal(state.val, localCache.get(state.key1))
    })
    it('and after it timed out', async () => {
      await wait(700)
      const res = localCache.has(state.key1)
      assert.equal(false, res)
      const ts = localCache.getTtl(state.key1)
      assert.equal(undefined, ts)
      state.n++
      assert.equal(undefined, localCache.get(state.key1))
    })
    it('set another key with ttl', () => {
      const res = localCache.set(state.key2, state.val, 0.5)
      assert.equal(true, res)
    })
    it('check this key immediately', () => {
      const res = localCache.get(state.key2)
      assert.equal(state.val, res)
    })
    it('before it times out', async () => {
      await wait(20)
      state.n++
      assert.equal(state.val, localCache.get(state.key2))
    })
    it('and after it timed out, too', async () => {
      await wait(500)
      const ts = localCache.getTtl(state.key2)
      assert.equal(undefined, ts)
      state.n++
      assert.equal(undefined, localCache.get(state.key2))
    })
    describe('test the automatic check', async () => {
      let innerState: { startKeys: number; key: Key; val: string }

      before(async () => {
        await wait(1000)
        innerState = {
          startKeys: localCache.getStats().keys,
          key: 'autotest',
          val: randomString(20),
        }
      })
      it('set a key with ttl', () => {
        localCache.once('set', (key: Key) => {
          assert.equal(innerState.key, key)
        })

        assert.equal(true, localCache.set(innerState.key, innerState.val, 0.5))
        assert.equal(innerState.startKeys + 1, localCache.getStats().keys)
        // event handler should have been fired
        assert.equal(0, localCache.listeners('set').length)
      })
      it("and check it's existence", () => {
        assert.equal(innerState.val, localCache.get(innerState.key))
      })
      it("wait for 'expired' event", async () => {
        localCache.once('expired', (key: Key, val: string) => {
          assert.equal(innerState.key, key)
          assert.equal(false, state.keys.includes(key))
          assert.equal(undefined, localCache.data[key])
        })
        await wait(550)
        // trigger ttl check, which will trigger the `expired` event
        localCache._checkData(false)
      })
    })
    describe('more ttl tests', () => {
      it('set a third key with ttl', () => {
        assert.equal(true, localCache.set(state.key3, state.val, 100))
      })
      it('check it immediately', () => {
        assert.equal(state.val, localCache.get(state.key3))
      })
      it('set ttl to the invalid key', () => {
        assert.equal(false, localCache.ttl(`${state.key3}false`, 0.3))
      })
      it('set ttl to the correct key', () => {
        assert.equal(true, localCache.ttl(state.key3, 0.3))
      })
      it('check if the key still exists', () => {
        const res = localCache.get(state.key3)
        assert.equal(state.val, res)
      })
      it('wait until ttl has ended and check if the key was deleted', async () => {
        await wait(500)
        const res = localCache.get(state.key3)
        assert.equal(undefined, res)
        assert.equal(undefined, localCache.data[state.key3])
      })
      it("set a key with ttl = 100s (default: infinite), reset it's ttl to default and check if it still exists", () => {
        assert.equal(true, localCache.set(state.key4, state.val, 100))
        // check immediately
        assert.equal(state.val, localCache.get(state.key4))
        // set ttl to false key
        assert.equal(false, localCache.ttl(`${state.key4}false`))
        // set default ttl (0) to the right key
        assert.equal(true, localCache.ttl(state.key4))
        // and check if it still exists
        const res = localCache.get(state.key4)
        assert.equal(state.val, res)
      })
      it("set a key with ttl = 100s (default: 0.3s), reset it's ttl to default, check if it still exists, and wait for its timeout", async () => {
        assert.equal(true, localCacheTTL.set(state.key5, state.val, 100))
        // check immediately
        assert.equal(state.val, localCacheTTL.get(state.key5))
        // set ttl to false key
        assert.equal(false, localCacheTTL.ttl(`${state.key5}false`))
        // set default ttl (0.3) to right key
        assert.equal(true, localCacheTTL.ttl(state.key5))
        // and check if it still exists
        assert.equal(state.val, localCacheTTL.get(state.key5))

        await wait(350)
        const res = localCacheTTL.get(state.key5)
        assert.equal(undefined, res)
        localCacheTTL._checkData(false)
        // deep dirty check if key was deleted
        assert.equal(undefined, localCacheTTL.data[state.key5])
      })

      it('set a key key with a cache initialized with no automatic delete on expire', async () => {
        const localCacheNoDelete = new nodeCache({
          stdTTL: 0.3,
          checkperiod: 0,
          deleteOnExpire: false,
        })

        localCacheNoDelete.set(state.key1, state.val)
        await wait(500)
        const res = localCacheNoDelete.get(state.key1)
        assert.equal(state.val, res)
      })
      it('test issue #78 with expire event not fired', async () => {
        // this.timeout(6000)
        const localCacheTTL2 = new nodeCache({
          stdTTL: 1,
          checkperiod: 0.5,
        })
        let expCount = 0
        const expkeys = ['ext78_test:a', 'ext78_test:b']
        localCacheTTL2.set(expkeys[0], expkeys[0], 2)
        localCacheTTL2.set(expkeys[1], expkeys[1], 3)
        localCacheTTL2.on('expired', (key, value) => {
          assert.equal(key, expkeys[expCount])
          assert.equal(value, expkeys[expCount])
          expCount++
        })

        await wait(5000)
        assert.equal(expCount, 2)
        localCacheTTL2.close()
      })
    })
  })
  describe('clone', () => {
    it('a function', async () => {
      const testKey = randomString(10)
      const testValue = 'hello world'
      const testValueFn = () => {
        return testValue
      }
      localCache.set(testKey, testValueFn)
      const fn = localCache.get(testKey)
      assert.equal(fn(), testValue)
    })
    it('a regex', () => {
      const testKey = randomString(10)
      const regex = new RegExp('\\b\\w{4}\\b', 'g')
      const match = 'king'
      const noMatch = 'bla'
      assert.equal(true, regex.test(match))
      assert.equal(false, regex.test(noMatch))
      localCache.set(testKey, regex)
      const cachedRegex = localCache.get(testKey)
      assert.equal(true, cachedRegex.test(match))
      assert.equal(false, cachedRegex.test(noMatch))
    })
  })
  describe('mset', () => {
    let state: { keyValueSet: ValueSetItem<string>[] }
    let localCacheMset: nodeCache<string>

    beforeEach(() => {
      localCacheMset = new nodeCache<string>({ stdTTL: 0 })
    })

    before(() => {
      state = {
        keyValueSet: [
          {
            key: randomString(10),
            val: randomString(10),
          },
          {
            key: randomString(10),
            val: randomString(10),
          },
        ],
      }
    })
    it('mset an array of key value pairs', () => {
      const res = localCacheMset.mset(state.keyValueSet)
      assert.equal(true, res)
      assert.equal(2, localCacheMset.getStats().keys)
    })
    it('mset - integer key', () => {
      state.keyValueSet[0].key = randomNumber(10)
      const res = localCacheMset.mset(state.keyValueSet)
      assert.equal(true, res)
      assert.equal(2, localCacheMset.getStats().keys)
    })
    it('mset - boolean key throw error', () => {
      state.keyValueSet[0].key = true as any
      assert.throws(() => localCacheMset.mset(state.keyValueSet), {
        name: 'EKEYTYPE',
        message:
          'The key argument has to be of type `string` or `number`. Found: `boolean`',
      })
    })
    it('mset - object key throw error', () => {
      state.keyValueSet[0].key = { a: 1 } as any
      assert.throws(() => localCacheMset.mset(state.keyValueSet), {
        name: 'EKEYTYPE',
        message:
          'The key argument has to be of type `string` or `number`. Found: `object`',
      })
    })
    it('mset - ttl type error check', () => {
      state.keyValueSet[0].ttl = { a: 1 } as any
      assert.throws(() => localCacheMset.mset(state.keyValueSet), {
        name: 'ETTLTYPE',
        message: 'The ttl argument has to be a number.',
      })
    })
  })
  describe('fetch', () => {
    let state: { func: () => string }

    beforeEach(() => {
      localCache.flushAll()

      state = {
        func: () => {
          return 'foo'
        },
      }
    })
    describe('when value is type of Function', () => {
      it('execute it and fetch returned value', () => {
        assert.equal('foo', localCache.fetch('key', 100, state.func))
      })
    })
    describe('when value is not a function', () => {
      it('return the value itself', () => {
        assert.equal('bar', localCache.fetch('key', 100, 'bar'))
      })
    })
    describe('cache hit', () => {
      it('return cached value', () => {
        localCache.set('key', 'bar', 100)
        assert.equal('bar', localCache.fetch('key', 100, state.func))
      })
    })
    describe('cache miss', () => {
      it('write given value to cache and return it', () => {
        assert.equal('foo', localCache.fetch('key', 100, state.func))
        assert.equal('foo', localCache.get('key'))
      })
    })
    describe('when ttl is omitted', () => {
      it('swap ttl and value', () => {
        assert.equal('foo', localCache.fetch('key', state.func))
      })
    })
  })
  describe('Issues', () => {
    describe('#151 - cannot set null', () => {
      let cache: nodeCache<any>

      before(() => {
        cache = new nodeCache()
      })
      after(() => {
        cache.close()
      })
      it('set the value `null` - this should not throw or otherwise fail', () => {
        assert.doesNotThrow(() => cache.set('test', null))
      })
      it('should also return `null`', () => {
        assert.equal(null, cache.get('test'))
      })
    })

    // This test is intentionally skipped since v6
    describe.skip("#197 - ReferenceError: Buffer is not defined (maybe we should have a general 'browser compatibility' test-suite?", () => {
      let cache: nodeCache<object>
      let globalBuffer = global.Buffer
      before(() => {
        // make `Buffer` globally unavailable
        // we have to explicitly set to `undefined` because our `clone` dependency checks for that
        ;(global.Buffer as any) = undefined
        cache = new nodeCache()
      })
      it('should not throw when setting a key of type `object` (or any other type that gets tested after `Buffer` in `_getValLength()`) when `Buffer` is not available in the global scope', () => {
        assert.equal(Buffer, undefined)
        cache.set('foo', {})
      })
      after(() => {
        global.Buffer = globalBuffer
        cache.close()
        assert.equal(Buffer, globalBuffer)
      })
    })

    describe('#263 - forceString never works', () => {
      let cache: nodeCache<string>

      before(() => {
        cache = new nodeCache({ forceString: true })
      })
      after(() => {
        cache.close()
      })
      it('set the value `null` - this should transform into a string', () => {
        cache.set('test', null as any)
        assert.equal(cache.get('test'), 'null')
      })
      it("set the value `{ hello: 'World' }` - this should transform into a string", () => {
        cache.set('test', {
          hello: 'World',
        } as any)
        assert.equal(cache.get('test'), '{"hello":"World"}')
      })
    })
  })
})
