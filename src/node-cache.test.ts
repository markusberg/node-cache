var localCache, localCacheNoDelete, localCacheTTL

import { readFileSync } from 'node:fs'
import nodeCache from './node-cache.js'
import { randomNumber, randomString, diffKeys } from './helpers.js'
import clone from '@markusberg/clone'
import { beforeEach, describe, it, before, after } from 'mocha'

import should from 'should'

const pkg = JSON.parse(readFileSync('package.json').toString())

localCache = new nodeCache({ stdTTL: 0 })

localCacheTTL = new nodeCache({
  stdTTL: 0.3,
  checkperiod: 0,
})

localCacheNoDelete = new nodeCache({
  stdTTL: 0.3,
  checkperiod: 0,
  deleteOnExpire: false,
})

let BENCH = {}

// just for testing disable the check period
localCache._killCheckPeriod()

describe(`\`${pkg.name}@${pkg.version}\` on \`node@${process.version}\``, function () {
  after(function () {
    var ops, txt, type
    txt = `Benchmark node@${process.version}:`
    for (type in BENCH) {
      ops = BENCH[type]
      txt += `\n   - ${type}: ${ops.toFixed(1)} ops/s`
    }
    console.log(txt)
  })
  describe('general sync-style', () => {
    let state

    before(function () {
      localCache.flushAll()
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
    it('set key', function () {
      var res
      res = localCache.set(state.key, state.value, 0)
      true.should.eql(res)
      ;(1).should.eql(localCache.getStats().keys - state.start.keys)
    })
    it('get key', function () {
      var res
      res = localCache.get(state.key)
      state.value.should.eql(res)
    })
    it('get key names', function () {
      var res
      res = localCache.keys()
      ;[state.key].should.eql(res)
    })
    it('has key', function () {
      var res
      res = localCache.has(state.key)
      res.should.eql(true)
    })
    it('does not have key', function () {
      var res
      res = localCache.has('non existing key')
      res.should.eql(false)
    })
    it('delete an undefined key', function () {
      var count
      count = localCache.del('xxx')
      ;(0).should.eql(count)
    })
    it('take key', function () {
      var otp, res
      // make sure we are starting fresh
      res = localCache.has('otp')
      res.should.eql(false)
      // taking a non-exitent value should be fine
      res = localCache.take('otp')
      should.not.exist(res)
      // check if otp insertion suceeded
      res = localCache.set('otp', state.otp, 0)
      true.should.eql(res)
      // are we able to check the presence of the key?
      res = localCache.has('otp')
      res.should.eql(true)
      // not once, but twice?
      // This proves that keys can be accessed as many times as required, but
      // not the value. The `take()` method makes the values as single-read, not the keys.
      res = localCache.has('otp')
      res.should.eql(true)
      // take the value
      otp = localCache.take('otp')
      otp.should.eql(state.otp)
      // key should not be present anymore once the value is read
      res = localCache.has('otp')
      res.should.eql(false)
      // and, re-insertions are not probhitied
      res = localCache.set('otp', 'some other value')
      true.should.eql(res)
      // should be able take the value again
      otp = localCache.take('otp')
      otp.should.eql('some other value')
      // key should not be present anymore, again
      res = localCache.has('otp')
      res.should.eql(false)
    })
    it('take key with falsy values', function () {
      var otp, res
      // make sure we are starting fresh
      res = localCache.has('otp')
      res.should.eql(false)
      // insert a falsy value and take it
      res = localCache.set('otp', 0)
      true.should.eql(res)
      otp = localCache.take('otp')
      otp.should.eql(0)
      // key should not exist anymore
      res = localCache.has('otp')
      res.should.eql(false)
    })
    it('update key (and get it to check if the update worked)', function () {
      var res
      res = localCache.set(state.key, state.value2, 0)
      true.should.eql(res)
      // check if the update worked
      res = localCache.get(state.key)
      state.value2.should.eql(res)
      // stats should not have changed
      ;(1).should.eql(localCache.getStats().keys - state.start.keys)
    })
    it('delete the defined key', function () {
      var count
      localCache.once('del', function (key, val) {
        state.key.should.eql(key)
        state.value2.should.eql(val)
      })
      count = localCache.del(state.key)
      ;(1).should.eql(count)
      // check stats
      ;(0).should.eql(localCache.getStats().keys - state.start.keys)
    })
    it('delete multiple keys (after setting them)', function () {
      var count, keys, res
      keys = ['multiA', 'multiB', 'multiC']
      // set the keys
      keys.forEach(function (key) {
        var res
        res = localCache.set(key, state.value3)
        true.should.eql(res)
      })
      // check the keys
      keys.forEach(function (key) {
        var res
        res = localCache.get(key)
        state.value3.should.eql(res)
      })
      // delete 2 of those keys
      count = localCache.del(keys.slice(0, 2))
      ;(2).should.eql(count)
      // try to get the deleted keys
      keys.slice(0, 2).forEach(function (key) {
        var res
        res = localCache.get(key)
        should(res).be.undefined()
      })
      // get the not deleted key
      res = localCache.get(keys[2])
      state.value3.should.eql(res)
      // delete this key, too
      count = localCache.del(keys[2])
      ;(1).should.eql(count)
      // try get the deleted key
      res = localCache.get(keys[2])
      should(res).be.undefined()
      // re-deleting the keys should not have to delete an actual key
      count = localCache.del(keys)
      ;(0).should.eql(count)
    })
    it('set a key to 0', function () {
      var res
      res = localCache.set('zero', 0)
      true.should.eql(res)
    })
    it('get previously set key', function () {
      var res
      res = localCache.get('zero')
      ;(0).should.eql(res)
    })
    it('set a key to an object clone', function () {
      var res
      res = localCache.set('clone', state.obj)
      true.should.eql(res)
    })
    it('get cloned object', function () {
      var res, res2
      res = localCache.get('clone')
      // should not be === equal
      state.obj.should.not.equal(res)
      // but should deep equal
      state.obj.should.eql(res)
      res.b.y = 42
      res2 = localCache.get('clone')
      state.obj.should.eql(res2)
    })
    it('test promise storage (fulfill before adding to cache)', function (done) {
      var deferred_value, p, q
      deferred_value = 'Some deferred value'
      if (typeof Promise !== 'undefined' && Promise !== null) {
        p = new Promise(function (fulfill, reject) {
          fulfill(deferred_value)
        })
        p.then(function (value) {
          deferred_value.should.eql(value)
        })
        localCache.set('promise', p)
        q = localCache.get('promise')
        q.then(function (value) {
          done()
        })
      } else {
        if (process.env.SILENT_MODE == null) {
          console.log(
            `No Promises available in this node version (${process.version})`,
          )
        }
        this.skip()
      }
    })
    it('test promise storage (fulfill after adding to cache)', function (done) {
      var callStub, called, deferred_value, p, q
      deferred_value = 'Some deferred value'
      if (typeof Promise !== 'undefined' && Promise !== null) {
        called = 0
        callStub = function () {
          called++
          if (called === 2) {
            done()
          }
        }
        p = new Promise(function (fulfill, reject) {
          var fulfiller
          fulfiller = function () {
            fulfill(deferred_value)
          }
          setTimeout(fulfiller, 250)
        })
        p.then(function (value) {
          deferred_value.should.eql(value)
          callStub()
        })
        localCache.set('promise', p)
        q = localCache.get('promise')
        q.then(function (value) {
          deferred_value.should.eql(value)
          callStub()
        })
      } else {
        if (process.env.SILENT_MODE == null) {
          console.log(
            `No Promises available in this node version (${process.version})`,
          )
        }
        this.skip()
      }
    })
    it('test es6 map', function () {
      var cached_map, key, map
      if (typeof Map === 'undefined' || Map === null) {
        if (process.env.SILENT_MODE == null) {
          console.log(
            `No Maps available in this node version (${process.version})`,
          )
        }
        this.skip()
        return
      }
      key = randomString(10)
      map = new Map([
        ['firstkey', 'firstvalue'],
        ['2ndkey', '2ndvalue'],
        ['thirdkey', 'thirdvalue'],
      ])
      localCache.set(key, map)
      map.set('fourthkey', 'fourthvalue')
      cached_map = localCache.get(key)
      should(cached_map.get('2ndkey')).eql('2ndvalue')
      should(cached_map.get('fourthkey')).be.undefined()
    })
    it('test `useClones = true` with an Object', function () {
      var c, key, value
      key = randomString(10)
      value = {
        a: 123,
        b: 456,
      }
      c = 789
      localCache.set(key, value)
      value.a = c
      value.should.not.be.eql(localCache.get(key))
    })
    it('test `useClones = false` with an Object', function () {
      const localCacheNoClone = new nodeCache({
        stdTTL: 0,
        useClones: false,
        checkperiod: 0,
      })

      var c, key, value
      key = randomString(10)
      value = {
        a: 123,
        b: 456,
      }
      c = 789
      localCacheNoClone.set(key, value)
      value.a = c
      should(value === localCacheNoClone.get(key)).be.true()
    })
  })
  describe('max key amount', function () {
    let state
    const localCacheMaxKeys = new nodeCache({ maxKeys: 2 })

    before(function () {
      state = {
        key1: randomString(10),
        key2: randomString(10),
        key3: randomString(10),
        value1: randomString(10),
        value2: randomString(10),
        value3: randomString(10),
      }
    })
    it('exceed max key size', function () {
      var setKey, setKey2
      setKey = localCacheMaxKeys.set(state.key1, state.value1, 0)
      true.should.eql(setKey)
      setKey2 = localCacheMaxKeys.set(state.key2, state.value2, 0)
      true.should.eql(setKey2)
      ;(function () {
        return localCacheMaxKeys.set(state.key3, state.value3, 0)
      }).should.throw({
        name: 'ECACHEFULL',
        message: 'Cache max keys amount exceeded',
      })
    })
    it('remove a key and set another one', function () {
      var del, setKey3
      del = localCacheMaxKeys.del(state.key1)
      ;(1).should.eql(del)
      setKey3 = localCacheMaxKeys.set(state.key3, state.value3, 0)
      true.should.eql(setKey3)
    })
  })
  describe('correct and incorrect key types', function () {
    describe('number', function () {
      let state
      before(function () {
        state = {
          keys: [],
          val: randomString(20),
        }
        for (let j = 1; j <= 10; j++) {
          state.keys.push(randomNumber(100000))
        }
      })
      it('set', function () {
        var j, key, len, ref, res
        ref = state.keys
        for (j = 0, len = ref.length; j < len; j++) {
          key = ref[j]
          res = localCache.set(key, state.val)
          true.should.eql(res)
        }
      })
      it('get', function () {
        var res
        res = localCache.get(state.keys[0])
        state.val.should.eql(res)
      })
      it('mget', function () {
        var prediction, res
        res = localCache.mget(state.keys.slice(0, 2))
        // generate prediction
        prediction = {}
        prediction[state.keys[0]] = state.val
        prediction[state.keys[1]] = state.val
        prediction.should.eql(res)
      })
      it('del single', function () {
        var count
        count = localCache.del(state.keys[0])
        ;(1).should.eql(count)
      })
      it('del multi', function () {
        var count
        count = localCache.del(state.keys.slice(1, 3))
        ;(2).should.eql(count)
      })
      it('ttl', function (done) {
        var res, success
        success = localCache.ttl(state.keys[3], 0.3)
        true.should.eql(success)
        res = localCache.get(state.keys[3])
        state.val.should.eql(res)
        setTimeout(function () {
          res = localCache.get(state.keys[3])
          should.not.exist(res)
          done()
        }, 400)
      })
      it('getTtl', function () {
        var now, ref, success, ttl
        now = Date.now()
        success = localCache.ttl(state.keys[4], 0.5)
        true.should.eql(success)
        ttl = localCache.getTtl(state.keys[4])
        ;(485 < (ref = ttl - now) && ref < 510).should.eql(true)
      })
      after(function () {
        localCache.flushAll(false)
      })
    })
    describe('string', function () {
      let state
      before(function () {
        state = {
          keys: [],
          val: randomString(20),
        }
        for (let j = 1; j <= 10; j++) {
          state.keys.push(randomString(10))
        }
      })
      it('set', function () {
        var j, key, len, ref, res
        ref = state.keys
        for (j = 0, len = ref.length; j < len; j++) {
          key = ref[j]
          res = localCache.set(key, state.val)
          true.should.eql(res)
        }
      })
      it('get', function () {
        var res
        res = localCache.get(state.keys[0])
        state.val.should.eql(res)
      })
      it('mget', function () {
        var prediction, res
        res = localCache.mget(state.keys.slice(0, 2))
        // generate prediction
        prediction = {}
        prediction[state.keys[0]] = state.val
        prediction[state.keys[1]] = state.val
        prediction.should.eql(res)
      })
      it('del single', function () {
        var count
        count = localCache.del(state.keys[0])
        ;(1).should.eql(count)
      })
      it('del multi', function () {
        var count
        count = localCache.del(state.keys.slice(1, 3))
        ;(2).should.eql(count)
      })
      it('ttl', function (done) {
        var res, success
        success = localCache.ttl(state.keys[3], 0.3)
        true.should.eql(success)
        res = localCache.get(state.keys[3])
        state.val.should.eql(res)
        setTimeout(function () {
          res = localCache.get(state.keys[3])
          should.not.exist(res)
          done()
        }, 400)
      })
      it('getTtl', function () {
        var now, ref, success, ttl
        now = Date.now()
        success = localCache.ttl(state.keys[4], 0.5)
        true.should.eql(success)
        ttl = localCache.getTtl(state.keys[4])
        ;(485 < (ref = ttl - now) && ref < 510).should.eql(true)
      })
    })
    describe('boolean - invalid type', function () {
      let state
      before(function () {
        state = {
          keys: [true, false],
          val: randomString(20),
        }
      })
      it('set sync-style', function () {
        ;(function () {
          return localCache.set(state.keys[0], state.val)
        }).should.throw({
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `boolean`',
        })
      })
      it('get sync-style', function () {
        ;(function () {
          return localCache.get(state.keys[0])
        }).should.throw({
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `boolean`',
        })
      })
      it('mget sync-style', function () {
        ;(function () {
          return localCache.mget(state.keys)
        }).should.throw({
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `boolean`',
        })
      })
      it('del single sync-style', function () {
        ;(function () {
          return localCache.del(state.keys[0])
        }).should.throw({
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `boolean`',
        })
      })
      it('del multi sync-style', function () {
        ;(function () {
          return localCache.del(state.keys)
        }).should.throw({
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `boolean`',
        })
      })
      it('ttl sync-style', function () {
        ;(function () {
          return localCache.ttl(state.keys[0], 10)
        }).should.throw({
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `boolean`',
        })
      })
      return it('getTtl sync-style', function () {
        ;(function () {
          return localCache.getTtl(state.keys[0])
        }).should.throw({
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `boolean`',
        })
      })
    })
    describe('object - invalid type', function () {
      let state
      before(function () {
        state = {
          keys: [
            {
              a: 1,
            },
            {
              b: 2,
            },
          ],
          val: randomString(20),
        }
      })
      it('set sync-style', function () {
        ;(function () {
          return localCache.set(state.keys[0], state.val)
        }).should.throw({
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `object`',
        })
      })
      it('get sync-style', function () {
        ;(function () {
          return localCache.get(state.keys[0])
        }).should.throw({
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `object`',
        })
      })
      it('mget sync-style', function () {
        ;(function () {
          return localCache.mget(state.keys)
        }).should.throw({
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `object`',
        })
      })
      it('del single sync-style', function () {
        ;(function () {
          return localCache.del(state.keys[0])
        }).should.throw({
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `object`',
        })
      })
      it('del multi sync-style', function () {
        ;(function () {
          return localCache.del(state.keys)
        }).should.throw({
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `object`',
        })
      })
      it('ttl sync-style', function () {
        ;(function () {
          return localCache.ttl(state.keys[0], 10)
        }).should.throw({
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `object`',
        })
      })
      return it('getTtl sync-style', function () {
        ;(function () {
          return localCache.getTtl(state.keys[0])
        }).should.throw({
          name: 'EKEYTYPE',
          message:
            'The key argument has to be of type `string` or `number`. Found: `object`',
        })
      })
    })
  })
  describe('flush', function () {
    let state
    before(function () {
      state = {
        n: 0,
        count: 100,
        startKeys: localCache.getStats().keys,
        keys: [],
        val: randomString(20),
      }
    })
    it('set keys', function () {
      var j, key, ref
      for (
        j = 1, ref = state.count;
        1 <= ref ? j <= ref : j >= ref;
        1 <= ref ? j++ : j--
      ) {
        key = randomString(7)
        state.keys.push(key)
      }
      state.keys.forEach(function (key) {
        localCache.set(key)
        state.n++
      })
      state.count.should.eql(state.n)
      ;(state.startKeys + state.count).should.eql(localCache.getStats().keys)
    })
    it('flush keys', function () {
      localCache.flushAll(false)
      ;(0).should.eql(localCache.getStats().keys)
      ;({}).should.eql(localCache.data)
    })
  })
  describe('flushStats', function () {
    var cache
    cache = null
    before(function () {
      cache = new nodeCache()
    })
    it('set cache and flush stats value', function () {
      var key, res, value
      key = randomString(10)
      value = randomString(10)
      res = cache.set(key, value)
      true.should.eql(res)
      ;(1).should.eql(cache.getStats().keys)
      cache.flushStats()
      ;(0).should.eql(cache.getStats().keys)
      cache.get(key)
      ;(1).should.eql(cache.getStats().hits)
      cache.get(randomString(10))
      ;(1).should.eql(cache.getStats().misses)
    })
  })
  describe('many', function () {
    let state
    return before(function () {
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
    this.timeout(0)

    let state

    before(function () {
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

    it('delete all previously set keys', function () {
      for (let i = 0; i < state.count; i++) {
        ;(1).should.eql(localCache.del(state.keys[i]))
        state.n++
      }
      state.n.should.eql(state.count)
      localCache.getStats().keys.should.eql(0)
    })

    it('delete keys again; should not delete anything', function () {
      for (let i = 0; i < state.count; i++) {
        ;(0).should.eql(localCache.del(state.keys[i]))
        state.n++
      }
      state.n.should.eql(state.count * 2)
      return localCache.getStats().keys.should.eql(0)
    })
  })
  describe('stats', function () {
    let state

    before(function () {
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
        true.should.eql(localCache.set(key, value, 0))
        state.n++
      }
    })
    it('get and remove `count` elements', function () {
      for (let i = 0; i < state.count; i++) {
        state.values[i].should.eql(localCache.get(state.keys[i]))
        state.n++
      }
      for (let i = 0; i < state.count; i++) {
        ;(1).should.eql(localCache.del(state.keys[i]))
        state.n++
      }
      const after = localCache.getStats()
      const diff = diffKeys(after, state.start)
      diff.hits.should.eql(5)
      diff.keys.should.eql(5)
      diff.ksize.should.eql(state.count * state.keylength)
      diff.vsize.should.eql(state.count * state.valuelength)
    })
    it('generate `count` misses', function () {
      for (let i = 0; i < state.count; i++) {
        // 4 char key should not exist
        should(localCache.get('xxxx')).be.undefined()
        state.n++
      }
      const after = localCache.getStats()
      const diff = diffKeys(after, state.start)
      diff.misses.should.eql(5)
    })
    it('check successful runs', function () {
      state.n.should.eql(5 * state.count)
    })
  })
  describe('multi', function () {
    let state

    before(function () {
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
    it('generate a sub-list of keys', function () {
      state.getKeys = state.keys.splice(50, 5)
    })
    it('generate prediction', function () {
      var j, key, len, ref
      state.prediction = {}
      ref = state.getKeys
      for (j = 0, len = ref.length; j < len; j++) {
        key = ref[j]
        state.prediction[key] = state.value
      }
    })
    it('try to mget with a single key', function () {
      ;(function () {
        return localCache.mget(state.getKeys[0])
      }).should.throw({
        name: 'EKEYSTYPE',
        message: 'The keys argument has to be an array.',
      })
      state.n++
    })
    it('mget the sub-list', function () {
      state.prediction.should.eql(localCache.mget(state.getKeys))
      state.n++
    })
    it('delete keys in the sub-list', function () {
      state.getKeys.length.should.eql(localCache.del(state.getKeys))
      state.n++
    })
    it('try to mget the sub-list again', function () {
      ;({}).should.eql(localCache.mget(state.getKeys))
      state.n++
    })
    it('check successful runs', function () {
      state.n.should.eql(state.count + 4)
    })
  })
  describe('ttl', function () {
    let state
    before(function () {
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
    describe('has validates expired ttl', function () {
      it('set a key with ttl', function () {
        true.should.eql(localCacheTTL.set(state.key6, state.val, 0.7))
      })
      it('check this key immediately', function () {
        true.should.eql(localCacheTTL.has(state.key6))
      })
      it('before it times out', function (done) {
        setTimeout(function () {
          var res
          state.n++
          res = localCacheTTL.has(state.key6)
          res.should.eql(true)
          state.val.should.eql(localCacheTTL.get(state.key6))
          done()
        }, 20)
      })
      return it('and after it timed out', function (done) {
        setTimeout(function () {
          var res
          res = localCacheTTL.has(state.key6)
          res.should.eql(false)
          state.n++
          should(localCacheTTL.get(state.key6)).be.undefined()
          done()
        }, 800)
      })
    })
    it('set a key with ttl', function () {
      var res, ts
      res = localCache.set(state.key1, state.val, 0.7)
      true.should.eql(res)
      ts = localCache.getTtl(state.key1)
      if (state.now < ts && ts < state.now + 300) {
        throw new Error('Invalid timestamp')
      }
    })
    it('check this key immediately', function () {
      state.val.should.eql(localCache.get(state.key1))
    })
    it('before it times out', function (done) {
      setTimeout(function () {
        var res
        state.n++
        res = localCache.has(state.key1)
        res.should.eql(true)
        state.val.should.eql(localCache.get(state.key1))
        done()
      }, 20)
    })
    it('and after it timed out', function (done) {
      setTimeout(function () {
        var res, ts
        res = localCache.has(state.key1)
        res.should.eql(false)
        ts = localCache.getTtl(state.key1)
        should.not.exist(ts)
        state.n++
        should(localCache.get(state.key1)).be.undefined()
        done()
      }, 700)
    })
    it('set another key with ttl', function () {
      var res
      res = localCache.set(state.key2, state.val, 0.5)
      true.should.eql(res)
    })
    it('check this key immediately', function () {
      var res
      res = localCache.get(state.key2)
      state.val.should.eql(res)
    })
    it('before it times out', function (done) {
      setTimeout(function () {
        state.n++
        state.val.should.eql(localCache.get(state.key2))
        done()
      }, 20)
    })
    it('and after it timed out, too', function (done) {
      setTimeout(function () {
        var ts
        ts = localCache.getTtl(state.key2)
        should.not.exist(ts)
        state.n++
        should(localCache.get(state.key2)).be.undefined()
        done()
      }, 500)
    })
    describe('test the automatic check', function (done) {
      var innerState
      innerState = null
      before(function (done) {
        setTimeout(function () {
          innerState = {
            startKeys: localCache.getStats().keys,
            key: 'autotest',
            val: randomString(20),
          }
          done()
        }, 1000)
      })
      it('set a key with ttl', function () {
        localCache.once('set', function (key) {
          innerState.key.should.eql(key)
        })
        true.should.eql(localCache.set(innerState.key, innerState.val, 0.5))
        ;(innerState.startKeys + 1).should.eql(localCache.getStats().keys)
        // event handler should have been fired
        ;(0).should.eql(localCache.listeners('set').length)
      })
      it("and check it's existence", function () {
        innerState.val.should.eql(localCache.get(innerState.key))
      })
      it("wait for 'expired' event", function (done) {
        localCache.once('expired', function (key, val) {
          innerState.key.should.eql(key)
          state.keys.includes(key).should.eql(false)
          should(localCache.data[key]).be.undefined()
          done()
        })
        setTimeout(function () {
          // trigger ttl check, which will trigger the `expired` event
          localCache._checkData(false)
        }, 550)
      })
    })
    describe('more ttl tests', function () {
      it('set a third key with ttl', function () {
        true.should.eql(localCache.set(state.key3, state.val, 100))
      })
      it('check it immediately', function () {
        state.val.should.eql(localCache.get(state.key3))
      })
      it('set ttl to the invalid key', function () {
        false.should.eql(localCache.ttl(`${state.key3}false`, 0.3))
      })
      it('set ttl to the correct key', function () {
        true.should.eql(localCache.ttl(state.key3, 0.3))
      })
      it('check if the key still exists', function () {
        var res
        res = localCache.get(state.key3)
        state.val.should.eql(res)
      })
      it('wait until ttl has ended and check if the key was deleted', function (done) {
        setTimeout(function () {
          var res
          res = localCache.get(state.key3)
          should(res).be.undefined()
          should(localCache.data[state.key3]).be.undefined()
          done()
        }, 500)
      })
      it("set a key with ttl = 100s (default: infinite), reset it's ttl to default and check if it still exists", function () {
        var res
        true.should.eql(localCache.set(state.key4, state.val, 100))
        // check immediately
        state.val.should.eql(localCache.get(state.key4))
        // set ttl to false key
        false.should.eql(localCache.ttl(`${state.key4}false`))
        // set default ttl (0) to the right key
        true.should.eql(localCache.ttl(state.key4))
        // and check if it still exists
        res = localCache.get(state.key4)
        state.val.should.eql(res)
      })
      it("set a key with ttl = 100s (default: 0.3s), reset it's ttl to default, check if it still exists, and wait for its timeout", function (done) {
        true.should.eql(localCacheTTL.set(state.key5, state.val, 100))
        // check immediately
        state.val.should.eql(localCacheTTL.get(state.key5))
        // set ttl to false key
        false.should.eql(localCacheTTL.ttl(`${state.key5}false`))
        // set default ttl (0.3) to right key
        true.should.eql(localCacheTTL.ttl(state.key5))
        // and check if it still exists
        state.val.should.eql(localCacheTTL.get(state.key5))
        setTimeout(function () {
          var res
          res = localCacheTTL.get(state.key5)
          should.not.exist(res)
          localCacheTTL._checkData(false)
          // deep dirty check if key was deleted
          should(localCacheTTL.data[state.key5]).be.undefined()
          done()
        }, 350)
      })
      it('set a key key with a cache initialized with no automatic delete on expire', function (done) {
        localCacheNoDelete.set(state.key1, state.val)
        setTimeout(function () {
          var res
          res = localCacheNoDelete.get(state.key1)
          should(res).eql(state.val)
          done()
        }, 500)
      })
      it('test issue #78 with expire event not fired', function (done) {
        this.timeout(6000)
        const localCacheTTL2 = new nodeCache({
          stdTTL: 1,
          checkperiod: 0.5,
        })
        let expCount = 0
        const expkeys = ['ext78_test:a', 'ext78_test:b']
        localCacheTTL2.set(expkeys[0], expkeys[0], 2)
        localCacheTTL2.set(expkeys[1], expkeys[1], 3)
        localCacheTTL2.on('expired', function (key, value) {
          key.should.eql(expkeys[expCount])
          value.should.eql(expkeys[expCount])
          expCount++
        })
        return setTimeout(function () {
          expCount.should.eql(2)
          localCacheTTL2.close()
          return done()
        }, 5000)
      })
    })
  })
  describe('clone', function () {
    it('a function', function (done) {
      var fn, key, value
      key = randomString(10)
      value = function () {
        done()
      }
      localCache.set(key, value)
      fn = localCache.get(key)
      fn()
    })
    it('a regex', function () {
      var cachedRegex, key, match, noMatch, regex
      key = randomString(10)
      regex = new RegExp('\\b\\w{4}\\b', 'g')
      match = 'king'
      noMatch = 'bla'
      true.should.eql(regex.test(match))
      false.should.eql(regex.test(noMatch))
      localCache.set(key, regex)
      cachedRegex = localCache.get(key)
      true.should.eql(cachedRegex.test(match))
      false.should.eql(cachedRegex.test(noMatch))
    })
  })
  describe('mset', function () {
    let state
    let localCacheMset

    beforeEach(() => {
      localCacheMset = new nodeCache({ stdTTL: 0 })
    })

    before(function () {
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
    it('mset an array of key value pairs', function () {
      const res = localCacheMset.mset(state.keyValueSet)
      true.should.eql(res)
      ;(2).should.eql(localCacheMset.getStats().keys)
    })
    it('mset - integer key', function () {
      state.keyValueSet[0].key = randomNumber(10)
      const res = localCacheMset.mset(state.keyValueSet)
      true.should.eql(res)
      ;(2).should.eql(localCacheMset.getStats().keys)
    })
    it('mset - boolean key throw error', function () {
      state.keyValueSet[0].key = true
      ;(function () {
        return localCacheMset.mset(state.keyValueSet)
      }).should.throw({
        name: 'EKEYTYPE',
        message:
          'The key argument has to be of type `string` or `number`. Found: `boolean`',
      })
    })
    it('mset - object key throw error', function () {
      state.keyValueSet[0].key = {
        a: 1,
      }
      ;(function () {
        return localCacheMset.mset(state.keyValueSet)
      }).should.throw({
        name: 'EKEYTYPE',
        message:
          'The key argument has to be of type `string` or `number`. Found: `object`',
      })
    })
    it('mset - ttl type error check', function () {
      state.keyValueSet[0].ttl = {
        a: 1,
      }
      ;(function () {
        return localCacheMset.mset(state.keyValueSet)
      }).should.throw({
        name: 'ETTLTYPE',
        message: 'The ttl argument has to be a number.',
      })
    })
  })
  describe('fetch', function () {
    let state

    beforeEach(function () {
      localCache.flushAll()

      state = {
        func: function () {
          return 'foo'
        },
      }
    })
    describe('when value is type of Function', function () {
      return it('execute it and fetch returned value', function () {
        'foo'.should.eql(localCache.fetch('key', 100, state.func))
      })
    })
    describe('when value is not a function', function () {
      return it('return the value itself', function () {
        'bar'.should.eql(localCache.fetch('key', 100, 'bar'))
      })
    })
    describe('cache hit', function () {
      return it('return cached value', function () {
        localCache.set('key', 'bar', 100)
        'bar'.should.eql(localCache.fetch('key', 100, state.func))
      })
    })
    describe('cache miss', function () {
      return it('write given value to cache and return it', function () {
        'foo'.should.eql(localCache.fetch('key', 100, state.func))
        'foo'.should.eql(localCache.get('key'))
      })
    })
    return describe('when ttl is omitted', function () {
      return it('swap ttl and value', function () {
        'foo'.should.eql(localCache.fetch('key', state.func))
      })
    })
  })
  describe('Issues', function () {
    describe('#151 - cannot set null', function () {
      let cache

      before(() => {
        cache = new nodeCache()
      })
      after(() => {
        cache.close()
      })
      it('set the value `null` - this should not throw or otherwise fail', function () {
        cache.set('test', null)
      })
      it('should also return `null`', function () {
        should(cache.get('test')).be.null()
      })
    })

    // This test is intentionally skipped since v6
    describe.skip("#197 - ReferenceError: Buffer is not defined (maybe we should have a general 'browser compatibility' test-suite?", function () {
      var cache, globalBuffer
      cache = null
      globalBuffer = global.Buffer
      before(() => {
        // make `Buffer` globally unavailable
        // we have to explicitly set to `undefined` because our `clone` dependency checks for that
        global.Buffer = void 0
        cache = new nodeCache()
      })
      it('should not throw when setting a key of type `object` (or any other type that gets tested after `Buffer` in `_getValLength()`) when `Buffer` is not available in the global scope', function () {
        should(Buffer).be.undefined()
        cache.set('foo', {})
      })
      after(function () {
        global.Buffer = globalBuffer
        cache.close()
        should(Buffer).eql(globalBuffer)
      })
    })

    describe('#263 - forceString never works', function () {
      let cache = null
      before(() => {
        cache = new nodeCache({ forceString: true })
      })
      after(() => {
        cache.close()
      })
      it('set the value `null` - this should transform into a string', function () {
        cache.set('test', null)
        should(cache.get('test')).eql('null')
      })
      it("set the value `{ hello: 'World' }` - this should transform into a string", function () {
        cache.set('test', {
          hello: 'World',
        })
        should(cache.get('test')).eql('{"hello":"World"}')
      })
    })
  })
})
