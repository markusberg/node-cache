export type Key = string | number

export interface WrappedValue<T> {
  // ttl
  t: number
  // value
  v: T
}

export interface Options {
  /**
   * If enabled, all values will be stringified during the set operation
   *
   * @type {boolean}
   * @memberof Options
   */
  forceString?: boolean

  objectValueSize?: number
  promiseValueSize?: number
  arrayValueSize?: number

  /**
   * standard time to live in seconds. 0 = infinity
   *
   * @type {number}
   * @memberof Options
   */
  stdTTL?: number

  /**
   * time in seconds to check all data and delete expired keys
   *
   * @type {number}
   * @memberof Options
   */
  checkperiod?: number

  /**
   * en/disable cloning of variables.
   * disabling this is strongly encouraged when aiming for performance!
   *
   * If `true`: set operations store a clone of the value and get operations will create a fresh clone of the cached value
   * If `false` you'll just store a reference to your value
   *
   * @type {boolean}
   * @memberof Options
   */
  useClones?: boolean

  errorOnMissing?: boolean
  deleteOnExpire?: boolean

  /**
   * max amount of keys that are being stored.
   * set operations will throw an error when the cache is full
   *
   * @type {number}
   * @memberof Options
   */
  maxKeys?: number
}

export interface Stats {
  hits: number
  misses: number
  keys: number
  ksize: number
  vsize: number
}

export type ValueSetItem<T> = {
  key: Key
  val: T
  ttl?: number
}

export type ERROR_CODE =
  | 'ENOTFOUND'
  | 'ECACHEFULL'
  | 'EKEYTYPE'
  | 'EKEYSTYPE'
  | 'ETTLTYPE'
