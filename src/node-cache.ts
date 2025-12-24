/*
 * @markusberg/node-cache 6.0.0 ( 2025-12-23 )
 * https://github.com/node-cache/node-cache
 *
 * Released under the MIT license
 * https://github.com/node-cache/node-cache/blob/master/LICENSE
 *
 * Maintained by  (  )
 */

import clone from '@markusberg/clone'
import { EventEmitter } from 'node:events'
import {
  ERROR_CODE,
  Key,
  Options,
  Stats,
  ValueSetItem,
  WrappedValue,
} from './interfaces.js'

export default class NodeCache<T> extends EventEmitter {
  ERRORS: Record<ERROR_CODE, (key: string) => string> = {
    ENOTFOUND: (key: string) => `Key \`${key}\` not found`,
    ECACHEFULL: () => 'Cache max keys amount exceeded',
    EKEYTYPE: (key: string) =>
      `The key argument has to be of type \`string\` or \`number\`. Found: \`${key}\``,
    EKEYSTYPE: () => 'The keys argument has to be an array.',
    ETTLTYPE: () => 'The ttl argument has to be a number.',
  }

  options: Options = {
    // convert all elements to string
    forceString: false,
    // used standard size for calculating value size
    objectValueSize: 80,
    promiseValueSize: 80,
    arrayValueSize: 40,
    // standard time to live in seconds. 0 = infinity;
    stdTTL: 0,
    // time in seconds to check all data and delete expired keys
    checkperiod: 600,
    // en/disable cloning of variables. If `true` you'll get a copy of the cached variable. If `false` you'll save and get just the reference
    useClones: true,
    // whether values should be deleted automatically at expiration
    deleteOnExpire: true,
    // enable legacy callbacks
    enableLegacyCallbacks: false,
    // max amount of keys that are being stored
    maxKeys: -1,
  }

  // container for cached data
  data: Record<Key, WrappedValue<T>> = {}

  // statistics container
  stats: Stats = {
    hits: 0,
    misses: 0,
    keys: 0,
    ksize: 0,
    vsize: 0,
  }

  // pre allocate valid keytypes array
  validKeyTypes = ['string', 'number']

  // timeout object for checkperiod
  #timeout: NodeJS.Timeout | null = null

  constructor(options: Partial<Options> = {}) {
    super()

    /**
     * FIXME:
     * This is an artifact from the coffeescript to javascript compilation
     * Every other one has been removed, but this one remains because
     * a test fails otherwise. Weird.
     */
    this._checkData = this._checkData.bind(this)

    // module options
    this.options = { ...this.options, ...options }

    // initalize checking period
    this._checkData()
    return
  }

  // get a cached key and change the stats
  // **Parameters:**
  // * `key` ( String | Number ): cache key
  // **Example:**
  //	myCache.get "myKey", ( err, val )
  get(key: Key): T | undefined {
    this.#checkKeyValidity(key)

    // get data and increment stats
    if (this.data[key] != null && this._check(key, this.data[key])) {
      this.stats.hits++
      return this._unwrap(this.data[key])
    }
    // if not found return undefined
    this.stats.misses++
    return undefined
  }

  // get multiple cached keys at once and change the stats
  // **Parameters:**
  // * `keys` ( String|Number[] ): an array of keys
  // **Example:**
  //	myCache.mget [ "foo", "bar" ]
  mget(keys: Key[]): Record<Key, T> {
    // convert a string to an array of one key
    if (!Array.isArray(keys)) {
      this.#throw('EKEYSTYPE')
    }
    // define return
    let oRet = {}
    for (const key of keys) {
      this.#checkKeyValidity(key)
      // get data and increment stats
      if (this.data[key] != null && this._check(key, this.data[key])) {
        this.stats.hits++
        oRet[key] = this._unwrap(this.data[key])
      } else {
        // if not found return a error
        this.stats.misses++
      }
    }
    // return all found keys
    return oRet
  }

  // set a cached key and change the stats
  // **Parameters:**
  // * `key` ( String | Number ): cache key
  // * `value` ( Any ): An element to cache. If the option `option.forceString` is `true` the module trys to translate it to a serialized JSON
  // * `[ ttl ]` ( Number | String ): ( optional ) The time to live in seconds.
  // **Example:**
  //	myCache.set "myKey", "my_String Value"
  //	myCache.set "myKey", "my_String Value", 10
  set(key: Key, value: T, ttl?: number): boolean {
    // check if cache is overflowing
    if (this.options.maxKeys > -1 && this.stats.keys >= this.options.maxKeys) {
      this.#throw('ECACHEFULL')
    }
    // force the data to string
    if (this.options.forceString && typeof value !== 'string') {
      value = JSON.stringify(value) as T
    }

    this.#checkKeyValidity(key)
    // internal helper variables
    let alreadyExists = !!this.data[key]
    if (alreadyExists) {
      // remove existing data from stats
      alreadyExists = true
      this.stats.vsize -= this._getValLength(
        this._unwrap(this.data[key], false),
      )
    }
    // set default ttl if not passed
    const realTtl = ttl || this.options.stdTTL

    // set the value
    this.data[key] = this._wrap(value, realTtl)
    this.stats.vsize += this._getValLength(value)
    // only add the keys and key-size if the key is new
    if (!alreadyExists) {
      this.stats.ksize += this._getKeyLength(key)
      this.stats.keys++
    }
    this.emit('set', key, value)
    return true
  }

  // in the event of a cache miss (no value is assinged to given cache key), value will be written to cache and returned. In case of cache hit, cached value will be returned without executing given value. If the given value is type of `Function`, it will be executed and returned result will be fetched
  // **Parameters:**
  // * `key` ( String | Number ): cache key
  // * `[ ttl ]` ( Number | String ): ( optional ) The time to live in seconds.
  // * `value` ( Any ): if `Function` type is given, it will be executed and returned value will be fetched, otherwise the value itself is fetched
  // **Example:**
  // myCache.fetch "myKey", 10, () => "my_String value"
  // myCache.fetch "myKey", "my_String value"
  fetch(key: Key, ttl: any, value: T | undefined) {
    // check if cache is hit
    if (this.has(key)) {
      return this.get(key)
    }
    if (typeof value === 'undefined') {
      value = ttl
      ttl = void 0
    }
    const _ret = typeof value === 'function' ? value() : value
    this.set(key, _ret, ttl)
    return _ret
  }

  // set multiple keys at once
  // **Parameters:**
  // * `keyValueSet` ( Object[] ): an array of objects which include key, value, and ttl
  // **Example:**
  //	myCache.mset(
  //		[
  //			{
  //				key: "myKey",
  //				val: "myValue",
  //				ttl: [ttl in seconds]
  //			}
  //		])
  mset(keyValueSet: ValueSetItem<T>[]): boolean {
    // check if cache is overflowing
    if (
      this.options.maxKeys > -1 &&
      this.stats.keys + keyValueSet.length >= this.options.maxKeys
    ) {
      this.#throw('ECACHEFULL')
    }

    // loop over keyValueSet to validate key and ttl
    for (const keyValuePair of keyValueSet) {
      const { key, val, ttl } = keyValuePair
      // check if there is ttl and it's a number
      if (ttl && typeof ttl !== 'number') {
        this.#throw('ETTLTYPE')
      }
      this.#checkKeyValidity(key)
    }
    for (const keyValuePair of keyValueSet) {
      const { key, val, ttl } = keyValuePair
      this.set(key, val, ttl)
    }
    return true
  }

  // remove keys
  // **Parameters:**
  // * `keys` ( String | Number | String|Number[] ): cache key to delete or an array of cache keys
  // **Return**
  // ( Number ): Number of deleted keys
  // **Example:**
  //	myCache.del( "myKey" )
  del(keyOrKeys: Key | Key[]): number {
    // convert keys to an array of itself
    const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys]

    let delCount = 0
    for (const key of keys) {
      this.#checkKeyValidity(key)

      // only delete if existent
      if (!!this.data[key]) {
        // calc the stats
        this.stats.vsize -= this._getValLength(
          this._unwrap(this.data[key], false),
        )
        this.stats.ksize -= this._getKeyLength(key)
        this.stats.keys--
        delCount++

        // delete the value
        const oldVal = this.data[key]
        delete this.data[key]
        // return true
        this.emit('del', key, oldVal.v)
      }
    }
    return delCount
  }

  // get the cached value and remove the key from the cache.
  // Equivalent to calling `get(key)` + `del(key)`.
  // Useful for implementing `single use` mechanism such as OTP, where once a value is read it will become obsolete.
  // **Parameters:**
  // * `key` ( String | Number ): cache key
  // **Example:**
  //	myCache.take "myKey", ( err, val )
  take(key: Key): T | undefined {
    const _ret = this.get(key)
    if (_ret != null) {
      this.del(key)
    }
    return _ret
  }

  // reset or redefine the ttl of a key. `ttl` = 0 means infinite lifetime.
  // If `ttl` is not passed the default ttl is used.
  // If `ttl` < 0 the key will be deleted.
  // **Parameters:**
  // * `key` ( String | Number ): cache key to reset the ttl value
  // * `ttl` ( Number ): ( optional -> options.stdTTL || 0 ) The time to live in seconds
  // **Return**
  // ( Boolen ): key found and ttl set
  // **Example:**
  //	myCache.ttl( "myKey" ) // will set ttl to default ttl
  //	myCache.ttl( "myKey", 1000 )
  ttl(key: Key, ttl: number): boolean {
    if (!key) {
      return false
    }
    this.#checkKeyValidity(key)

    const realTtl = ttl || this.options.stdTTL
    // check for existent data and update the ttl value
    if (this.data[key] != null && this._check(key, this.data[key])) {
      // if ttl < 0 delete the key. otherwise reset the value
      if (realTtl >= 0) {
        this.data[key] = this._wrap(this.data[key].v, realTtl, false)
      } else {
        this.del(key)
      }
      return true
    }
    return false
  }

  // receive the ttl of a key.
  // **Parameters:**
  // * `key` ( String | Number ): cache key to check the ttl value of
  // **Return**
  // ( Number|undefined ): The timestamp in ms when the key will expire, 0 if it will never expire or undefined if it not exists
  // **Example:**
  //	myCache.getTtl( "myKey" )
  getTtl(key: Key): number | undefined {
    if (!key) {
      return undefined
    }
    this.#checkKeyValidity(key)

    // check for existant data and update the ttl value
    if (this.data[key] != null && this._check(key, this.data[key])) {
      return this.data[key].t
    }
    // return undefined if key has not been found
    return undefined
  }

  // list all keys within this cache
  // **Return**
  // ( Array ): An array of all keys
  // **Example:**
  //     _keys = myCache.keys()
  //     # [ "foo", "bar", "fizz", "buzz", "anotherKeys" ]
  keys(): Key[] {
    return Object.keys(this.data)
  }

  // Check if a key is cached
  // **Parameters:**
  // * `key` ( String | Number ): cache key to check the ttl value
  // **Return**
  // ( Boolean ): A boolean that indicates if the key is cached
  // **Example:**
  //     _exists = myCache.has('myKey')
  //     # true
  has(key: Key): boolean {
    const exists = this.data[key] != null && this._check(key, this.data[key])
    return exists
  }

  // get the stats
  // **Parameters:**
  // -
  // **Return**
  // ( Object ): Stats data
  // **Example:**
  //     myCache.getStats()
  //     # {
  //     # hits: 0,
  //     # misses: 0,
  //     # keys: 0,
  //     # ksize: 0,
  //     # vsize: 0
  //     # }
  getStats(): Stats {
    return this.stats
  }

  // flush the whole data and reset the stats
  // **Example:**
  //     myCache.flushAll()
  //     myCache.getStats()
  //     # {
  //     # hits: 0,
  //     # misses: 0,
  //     # keys: 0,
  //     # ksize: 0,
  //     # vsize: 0
  //     # }
  flushAll(_startPeriod = true): void {
    // parameter just for testing

    // set data empty
    this.data = {}
    // reset stats
    this.stats = {
      hits: 0,
      misses: 0,
      keys: 0,
      ksize: 0,
      vsize: 0,
    }
    // reset check period
    this.#killCheckPeriod()
    this._checkData(_startPeriod)
    this.emit('flush')
  }

  // flush the stats and reset all counters to 0
  // **Example:**
  //     myCache.flushStats()
  //     myCache.getStats()
  //     # {
  //     # hits: 0,
  //     # misses: 0,
  //     # keys: 0,
  //     # ksize: 0,
  //     # vsize: 0
  //     # }
  flushStats() {
    // reset stats
    this.stats = {
      hits: 0,
      misses: 0,
      keys: 0,
      ksize: 0,
      vsize: 0,
    }
    this.emit('flush_stats')
  }

  // This will clear the interval timeout which is set on checkperiod option.
  close() {
    this.#killCheckPeriod()
  }

  // internal housekeeping method.
  // Check all the cached data and delete the invalid values
  _checkData(startPeriod = true): void {
    for (const [key, value] of Object.entries(this.data)) {
      this._check(key, value)
    }
    if (startPeriod && this.options.checkperiod > 0) {
      this.#timeout = setTimeout(
        this._checkData,
        this.options.checkperiod * 1000,
        startPeriod,
      )
      this.#timeout.unref()
    }
  }

  // stop the checkdata period. Only needed to abort the script in testing mode.
  #killCheckPeriod(): void {
    if (this.#timeout !== null) {
      clearTimeout(this.#timeout)
      this.#timeout = null
    }
  }

  // internal method the check the value. If it's not valid any more delete it
  _check(key: Key, data: WrappedValue<T>): boolean {
    let _retval = true
    // data is invalid if the ttl is too old and is not 0
    // console.log data.t < Date.now(), data.t, Date.now()
    if (data.t !== 0 && data.t < Date.now()) {
      if (this.options.deleteOnExpire) {
        _retval = false
        this.del(key)
      }
      this.emit('expired', key, this._unwrap(data))
    }
    return _retval
  }

  // internal method to check if the type of a key is either `number` or `string`
  #checkKeyValidity(key: Key): void {
    const keyType = typeof key

    if (!this.validKeyTypes.includes(keyType)) {
      this.#throw('EKEYTYPE', keyType)
    }
  }

  // internal method to wrap a value in an object with some metadata
  _wrap<T>(value: T, ttl: number, asClone = true): WrappedValue<T> {
    if (!this.options.useClones) {
      asClone = false
    }
    // define the time to live
    const now = Date.now()
    let livetime = 0
    const ttlMultiplicator = 1000
    // use given ttl
    if (ttl === 0) {
      livetime = 0
    } else if (ttl) {
      livetime = now + ttl * ttlMultiplicator
    } else {
      // use standard ttl
      if (this.options.stdTTL === 0) {
        livetime = this.options.stdTTL
      } else {
        livetime = now + this.options.stdTTL * ttlMultiplicator
      }
    }
    // return the wrapped value
    return {
      t: livetime,
      v: asClone ? clone(value) : value,
    }
  }

  // internal method to extract get the value out of the wrapped value
  _unwrap<T>(value: WrappedValue<T>, asClone = true): T | null {
    if (!this.options.useClones) {
      asClone = false
    }
    if (value.v != null) {
      if (asClone) {
        return clone(value.v)
      } else {
        return value.v
      }
    }
    return null
  }

  // internal method the calculate the key length
  _getKeyLength(key: Key): number {
    return key.toString().length
  }

  // internal method to calculate the value length
  _getValLength(value: unknown): number {
    if (typeof value === 'string') {
      // if the value is a String get the real length
      return value.length
    } else if (this.options.forceString) {
      // force string if it's defined and not passed
      return JSON.stringify(value).length
    } else if (Array.isArray(value)) {
      // if the data is an Array multiply each element with a defined default length
      return this.options.arrayValueSize * value.length
    } else if (typeof value === 'number') {
      return 8
    } else if (
      typeof (value != null ? (value as any).then : void 0) === 'function'
    ) {
      // if the data is a Promise, use defined default
      // (can't calculate actual/resolved value size synchronously)
      return this.options.promiseValueSize
    } else if (
      typeof Buffer !== 'undefined' && Buffer !== null
        ? Buffer.isBuffer(value)
        : void 0
    ) {
      return (value as any).length
    } else if (value != null && typeof value === 'object') {
      // if the data is an Object multiply each element with a defined default length
      return this.options.objectValueSize * Object.keys(value).length
    } else if (typeof value === 'boolean') {
      return 8
    } else {
      // default fallback
      return 0
    }
  }

  // internal method to handle an error message
  #throw(type: ERROR_CODE, payload?: string): void {
    // generate the error object
    const error: any = new Error()
    error.name = type
    error.errorcode = type
    error.message = this.ERRORS[type](payload)
    error.data = payload
    throw error
  }
}
