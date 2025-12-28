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
   * @default false
   */
  forceString: boolean

  /**
   * Default sizes of specific objects
   */
  objectValueSize: number
  promiseValueSize: number
  arrayValueSize: number

  /**
   * Standard time to live in seconds. 0 = infinity
   * @default 0
   */
  stdTTL: number

  /**
   * Interval in seconds between cache-wide expiration checks
   * @default 600
   */
  checkperiod: number

  /**
   * Enable/disable cloning of values
   * Disabling this is strongly encouraged when aiming for performance!
   *
   * If `true` set operations store a clone of the value and get operations will create a fresh clone of the cached value
   * If `false` you'll just store a reference to your value
   * @default true
   */
  useClones: boolean

  /**
   * Delete the key/values from the cache on expiration
   * @default true
   */
  deleteOnExpire: boolean

  /**
   * The maximum number of keys to be stored. When cache is full,
   * set operations will throw an error
   * @default -1
   */
  maxKeys: number
}

export interface Stats {
  hits: number
  misses: number
  keys: number
  ksize: number
  vsize: number
}

/**
 * When setting multiple values at once, an array of ValueSetItems is passed to mset
 */
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
