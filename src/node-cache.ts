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
import type {
  ERROR_CODE,
  Key,
  Options,
  Stats,
  ValueSetItem,
  WrappedValue,
} from './interfaces.js'

export * from './interfaces.js'

export default class NodeCache<T> extends EventEmitter {
  constructor(options: Partial<Options> = {}) {
    super()

    this.#options = { ...this.#options, ...options }
    this.#checkData()
  }

  #ERRORS: Record<ERROR_CODE, (key: string) => string> = {
    ENOTFOUND: (key: string) => `Key \`${key}\` not found`,
    ECACHEFULL: () => 'Cache max keys amount exceeded',
    EKEYTYPE: (key: string) =>
      `The key argument has to be of type \`string\` or \`number\`. Found: \`${key}\``,
    EKEYSTYPE: () => 'The keys argument has to be an array.',
    ETTLTYPE: () => 'The ttl argument has to be a number.',
  }

  // default module options
  #options: Options = {
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
    // max amount of keys that are being stored
    maxKeys: -1,
  }

  // container for cached data
  #data: Map<Key, WrappedValue<T>> = new Map()
  // expose data for testing
  get data(): Record<Key, WrappedValue<T>> {
    return Object.fromEntries(this.#data)
  }

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

  /**
   * Get a cached key and update statistics.
   * @param key - The cache key (string or number)
   * @returns The cached value or undefined if not found
   * @example
   * const value = myCache.get('myKey')
   */
  get(key: Key): T | undefined {
    this.#validateKey(key)

    // get data and increment stats
    const value = this.#data.get(key)
    if (value && this.#check(key, value)) {
      this.stats.hits++
      return this.#unwrap(value)
    }

    // if not found return undefined
    this.stats.misses++
    return undefined
  }

  /**
   * Get multiple cached keys at once and update statistics.
   * @param keys - An array of cache keys
   * @returns An object with key-value pairs for found keys
   * @example
   * const values = myCache.mget(['foo', 'bar'])
   */
  mget(keys: Key[]): Record<Key, T> {
    // convert a string to an array of one key
    if (!Array.isArray(keys)) {
      throw this.#err('EKEYSTYPE')
    }

    // define return
    const returnMap: Map<Key, T> = new Map()
    for (const key of keys) {
      this.#validateKey(key)
      // get data and increment stats
      const value = this.#data.get(key)
      if (value && this.#check(key, value)) {
        this.stats.hits++
        returnMap.set(key, this.#unwrap(value))
      } else {
        // if not found return a error
        this.stats.misses++
      }
    }
    // return all found keys
    return Object.fromEntries(returnMap)
  }

  /**
   * Set a cached key and update statistics.
   * @param key - The cache key (string or number)
   * @param value - The value to cache. If forceString option is true, it will be JSON serialized
   * @param ttl - Optional time to live in seconds (0 = infinite)
   * @returns true if the value was set successfully
   * @example
   * myCache.set('myKey', 'myValue')
   * myCache.set('myKey', 'myValue', 10) // expires in 10 seconds
   */
  set(key: Key, value: T, ttl?: number): boolean {
    this.#validateMaxKeys(1)

    // force the data to string
    if (this.#options.forceString && typeof value !== 'string') {
      value = JSON.stringify(value) as T
    }

    this.#validateKey(key)

    if (this.#data.has(key)) {
      // remove existing data from stats
      this.stats.vsize -= this.#getValLength(
        this.#unwrap(this.#data.get(key)!, false),
      )
    } else {
      this.stats.ksize += this.#getKeyLength(key)
      this.stats.keys++
    }
    const realTtl = this.#normalizeTtl(ttl)

    // set the value and update stats
    this.#data.set(key, this.#wrap(value, realTtl))
    this.stats.vsize += this.#getValLength(value)

    // only add the keys and key-size if the key is new
    this.emit('set', key, value)
    return true
  }

  /**
   * Fetch a value from cache, or set and return a new value if not found.
   * If a Function is provided, it will be executed and its result cached.
   * @param key - The cache key
   * @param ttl - Time to live in seconds, or the value if value param is omitted
   * @param value - The value to cache (can be a function that returns the value)
   * @returns The cached or computed value
   * @example
   * myCache.fetch('myKey', 10, () => expensiveComputation())
   * myCache.fetch('myKey', 'staticValue')
   */
  fetch(key: Key, ttl: number, valueOrFn: T | (() => T)): T
  fetch(key: Key, valueOrFn: T | (() => T)): T
  fetch(key: Key, ttl: number | T | (() => T), valueOrFn?: T | (() => T)): T {
    // check if cache is hit
    const val = this.get(key)
    if (val !== undefined) {
      return val
    }

    let realTtl: number | undefined
    let realValue: T | (() => T)

    if (valueOrFn === undefined) {
      realTtl = undefined
      realValue = ttl as T | (() => T)
    } else {
      if (typeof ttl !== 'number') {
        throw this.#err('ETTLTYPE')
      }
      realTtl = ttl as number
      realValue = valueOrFn
    }

    const _ret: T =
      typeof realValue === 'function' ? (realValue as () => T)() : realValue
    this.set(key, _ret, realTtl)
    return _ret
  }

  /**
   * Set multiple key-value pairs at once.
   * @param keyValueSet - An array of objects with key, val, and optional ttl properties
   * @returns true if all values were set successfully
   * @example
   * myCache.mset([
   *   { key: 'key1', val: 'value1', ttl: 10 },
   *   { key: 'key2', val: 'value2' }
   * ])
   */
  mset(keyValueSet: ValueSetItem<T>[]): boolean {
    this.#validateMaxKeys(keyValueSet.length)

    // loop over keyValueSet to validate key and ttl
    for (const keyValuePair of keyValueSet) {
      const { key, val, ttl } = keyValuePair
      // check if there is ttl and it's a number
      if (ttl && typeof ttl !== 'number') {
        throw this.#err('ETTLTYPE')
      }
      this.#validateKey(key)
      this.set(key, val, ttl)
    }
    return true
  }

  /**
   * Remove one or more keys from the cache.
   * @param keyOrKeys - A key or array of keys to delete
   * @returns The number of keys that were deleted
   * @example
   * myCache.del('myKey')
   * myCache.del(['key1', 'key2'])
   */
  del(keyOrKeys: Key | Key[]): number {
    // convert keys to an array of itself
    const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys]

    let delCount = 0
    for (const key of keys) {
      this.#validateKey(key)

      const value = this.#data.get(key)
      if (value) {
        // update statistics
        this.stats.vsize -= this.#getValLength(this.#unwrap(value, false))
        this.stats.ksize -= this.#getKeyLength(key)
        this.stats.keys--
        delCount++

        // delete the entry from cache
        this.#data.delete(key)

        // emit deletion event
        this.emit('del', key, value.v)
      }
    }
    return delCount
  }

  /**
   * Get and delete a key from cache in one operation.
   * Useful for single-use values like OTPs where the value should be consumed only once.
   * @param key - The cache key
   * @returns The cached value, or undefined if not found
   * @example
   * const otp = myCache.take('otp-token')
   */
  take(key: Key): T | undefined {
    const value = this.get(key)
    if (value !== undefined) {
      this.del(key)
    }
    return value
  }

  /**
   * Reset or redefine the TTL of a key.
   * @param key - The cache key
   * @param ttl - Time to live in seconds (0 = infinite, negative = delete key)
   * @returns true if the key was found and ttl was set, false otherwise
   * @example
   * myCache.ttl('myKey') // set to default TTL
   * myCache.ttl('myKey', 1000) // set to 1000 seconds
   */
  ttl(key: Key, ttl?: number): boolean {
    this.#validateKey(key)

    const realTtl: number = this.#normalizeTtl(ttl)
    // check for existent data and update the ttl value
    const value: WrappedValue<T> | undefined = this.#data.get(key)
    if (value && this.#check(key, value)) {
      // if ttl < 0 delete the key. otherwise reset the value
      if (realTtl >= 0) {
        this.#data.set(key, this.#wrap(value.v, realTtl, false))
      } else {
        this.del(key)
      }
      return true
    }
    return false
  }

  /**
   * Get the TTL (time to live) of a key.
   * @param key - The cache key
   * @returns The timestamp in ms when the key will expire, 0 if infinite, or undefined if not found
   * @example
   * const ttl = myCache.getTtl('myKey')
   */
  getTtl(key: Key): number | undefined {
    this.#validateKey(key)

    // check for existant data and update the ttl value
    const value: WrappedValue<T> | undefined = this.#data.get(key)
    if (value && this.#check(key, value)) {
      return value.t
    }
    return undefined
  }

  /**
   * List all keys currently stored in the cache.
   * @returns An array of all cache keys
   * @example
   * const allKeys = myCache.keys()
   */
  keys(): Key[] {
    return Array.from(this.#data.keys())
  }

  /**
   * Check if a key exists in the cache and is still valid.
   * @param key - The cache key to check
   * @returns true if the key exists and is not expired, false otherwise
   * @example
   * if (myCache.has('myKey')) {
   *   console.log('Key exists!')
   * }
   */
  has(key: Key): boolean {
    const value: WrappedValue<T> | undefined = this.#data.get(key)
    if (value) {
      return this.#check(key, value)
    }
    return false
  }

  /**
   * Get cache statistics.
   * @returns Statistics object with hits, misses, keys count, and sizes
   * @example
   * const stats = myCache.getStats()
   * console.log(stats.hits, stats.misses)
   */
  getStats(): Stats {
    return this.stats
  }

  /**
   * Clear all data from the cache and reset statistics.
   * @param _startPeriod - Internal parameter for testing
   * @example
   * myCache.flushAll()
   */
  flushAll(): void {
    // parameter just for testing

    // reset cache data to empty Map
    this.#data.clear()

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
    this.#checkData()
    this.emit('flush')
  }

  /**
   * Reset all statistics counters to 0 without clearing cached data.
   * @example
   * myCache.flushStats()
   */
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

  /**
   * Close the cache and stop the periodic cleanup process.
   * @example
   * myCache.close()
   */
  close() {
    this.#killCheckPeriod()
  }

  /**
   * Internal housekeeping method that checks and deletes expired values.
   * @internal
   */
  #checkData(): void {
    this._checkData()

    if (this.#options.checkperiod > 0) {
      this.#timeout = setTimeout(
        () => this.#checkData(),
        this.#options.checkperiod * 1000,
      )
      this.#timeout.unref()
    }
  }

  /**
   * Check current data without setting a timer
   */
  _checkData(): void {
    for (const [key, value] of this.#data) {
      this.#check(key, value)
    }
  }

  /**
   * Stop the periodic cleanup process (internal use).
   * @internal
   */
  #killCheckPeriod(): void {
    if (this.#timeout !== null) {
      clearTimeout(this.#timeout)
      this.#timeout = null
    }
  }

  /**
   * Check if a value is still valid (internal use).
   * @internal
   */
  #check(key: Key, data: WrappedValue<T>): boolean {
    let _retval = true
    // data is invalid if the ttl is too old and is not 0
    // console.log data.t < Date.now(), data.t, Date.now()
    if (data.t !== 0 && data.t < Date.now()) {
      if (this.#options.deleteOnExpire) {
        _retval = false
        this.del(key)
      }
      this.emit('expired', key, this.#unwrap(data))
    }
    return _retval
  }

  /**
   * Validate that a key is of the correct type
   * @internal
   */
  #validateKey(key: Key): void {
    const keyType = typeof key

    if (!this.validKeyTypes.includes(keyType)) {
      throw this.#err('EKEYTYPE', keyType)
    }
  }

  /**
   * Throws an error if the provided number of keys would cause the cache to exceed maxKeys.
   * @param num - The number of keys to validate
   */
  #validateMaxKeys(num: number): void {
    if (
      this.#options.maxKeys > -1 &&
      this.stats.keys + num > this.#options.maxKeys
    ) {
      throw this.#err('ECACHEFULL')
    }
  }

  /**
   * Normalize ttl value. If undefined, returns default ttl. If a number, returns it.
   * @param ttl - requested ttl
   * @returns
   */
  #normalizeTtl(ttl: unknown): number {
    if (ttl === undefined) {
      return this.#options.stdTTL
    }
    if (typeof ttl === 'number') {
      return ttl
    }
    throw this.#err('ETTLTYPE')
  }

  /**
   * Wrap a value with metadata for storage (internal use).
   * @internal
   */
  #wrap<T>(value: T, ttl: number, asClone = true): WrappedValue<T> {
    const useClone = !this.#options.useClones ? false : asClone

    // define the time to live
    const now = Date.now()
    const livetime = ttl === 0 ? 0 : now + ttl * 1000

    // return the wrapped value
    return {
      t: livetime,
      v: useClone ? clone(value) : value,
    }
  }

  /**
   * Unwrap a stored value from its metadata (internal use).
   * @internal
   */
  #unwrap(value: WrappedValue<T>, asClone = true): T {
    const useClone = !this.#options.useClones ? false : asClone
    return useClone ? clone(value.v) : value.v
  }

  /**
   * Calculate the length of a key (internal use).
   * @internal
   */
  #getKeyLength(key: Key): number {
    return key.toString().length
  }

  /**
   * Calculate the length of a value for statistics (internal use).
   * @internal
   */
  #getValLength(value: unknown): number {
    if (typeof value === 'string') {
      return value.length
    } else if (this.#options.forceString) {
      return JSON.stringify(value).length
    } else if (Array.isArray(value)) {
      // if the data is an Array multiply each element with a defined default length
      return this.#options.arrayValueSize * value.length
    } else if (typeof value === 'number') {
      return 8
    } else if (value instanceof Promise) {
      // if the data is a Promise, use defined default
      // (can't calculate actual/resolved value size synchronously)
      return this.#options.promiseValueSize
    } else if (Buffer.isBuffer(value)) {
      return value.length
    } else if (!!value && typeof value === 'object') {
      // if the data is an Object multiply each element with a defined default length
      return this.#options.objectValueSize * Object.keys(value).length
    } else if (typeof value === 'boolean') {
      return 8
    } else {
      // default fallback
      return 0
    }
  }

  /**
   * Generate an error to be thrown
   * @internal
   */
  #err(type: ERROR_CODE, payload: string = ''): Error {
    // generate the error object
    const error: any = new Error()
    error.name = type
    error.errorcode = type
    error.message = this.#ERRORS[type](payload)
    error.data = payload
    return error
  }
}
