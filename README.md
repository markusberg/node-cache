![Logo](./logo/logo.png)

[![node.js build](https://github.com/markusberg/node-cache/actions/workflows/badges.yaml/badge.svg)](https://github.com/markusberg/node-cache/actions/workflows/badges.yaml)
[![coverage](https://markusberg.github.io/node-cache/badges/coverage-6.0.0.svg)](https://github.com/markusberg/node-cache/actions)
![version](https://img.shields.io/npm/v/@markusberg/node-cache.svg)
[![license](https://img.shields.io/github/license/markusberg/node-cache.svg)](./LICENSE)
[![downloads](https://img.shields.io/npm/dt/@markusberg/node-cache.svg)](http://npm-stat.com/charts.html?package=@markusberg/node-cache)

# Simple and fast NodeJS internal caching.

A simple caching module that has `set`, `get` and `delete` methods and works a little bit like memcached.
Keys can have a timeout (`ttl`) after which they expire and are deleted from the cache.
All keys are stored in a single object so the practical limit is at around 1m keys.

## Fork information

This package is a fork of the original [node-cache](https://www.npmjs.com/package/node-cache) package
that's currently unmaintained. It is a TypeScript migration of both the node-cache library and its tests.
The migration of this package is the reason for my previous migration of the
[clone](https://www.npmjs.com/package/@markusberg/clone) library, because that package is the only hard
dependency that node-cache has.

To help minimize version confusion, the first version of this package is 6.0.0 which was supposed to
be the next version of node-cache.

The aim is to have v6.0.0 be compatible with node-cache v5.1.2 minus deprecations. Also, v6.0.0
is [ESModule only](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c), and drops support for Node.Js versions below 20.

# Install

```bash
npm install @markusberg/node-cache
```

# Examples:

## Initialize (INIT):

```TypeScript
import NodeCache from '@markusberg/node-cache'
const myCache = new NodeCache<T>()
```

### Options

- `stdTTL`: _(default: `0`)_ the standard ttl as number in seconds for every generated cache element.
  `0` = unlimited
- `checkperiod`: _(default: `600`)_ The period in seconds, as a number, used for the automatic delete check interval.
  `0` = no periodic check.
- `useClones`: _(default: `true`)_ en/disable cloning of variables. If `true` you'll get a copy of the cached variable. If `false` you'll save and get just the reference.  
  **Note:** - `true` is recommended if you want **simplicity**, because it'll behave like a server-based cache (it caches copies of plain data). - `false` is recommended if you want to achieve **performance** or save mutable objects or other complex types with mutability involved and wanted, because it'll only store references of your data. - _Here's a [simple code example](https://runkit.com/mpneuried/useclones-example-83) showing the different behavior_
- `deleteOnExpire`: _(default: `true`)_ whether variables will be deleted automatically when they expire.
  If `true` the variable will be deleted. If `false` the variable will remain. You are encouraged to handle the variable upon the event `expired` by yourself.
- `enableLegacyCallbacks`: _(default: `false`)_ re-enables the usage of callbacks instead of sync functions. Adds an additional `cb` argument to each function which resolves to `(err, result)`. will be removed in node-cache v6.x.
- `maxKeys`: _(default: `-1`)_ specifies a maximum amount of keys that can be stored in the cache. If a new item is set and the cache is full, an error is thrown and the key will not be saved in the cache. -1 disables the key limit.

```TypeScript
import NodeCache from '@markusberg/node-cache'
const myCache = new NodeCache({ stdTTL: 100, checkperiod: 120 })
```

**Since `4.1.0`**:
_Key-validation_: The keys can be given as either `string` or `number`, but are casted to a `string` internally anyway.
All other types will throw an error.

## Store a key (SET):

`myCache.set(key, val, [ ttl ])`

Sets a `key` `value` pair. It is possible to define a `ttl` (in seconds).
Returns `true` on success.

```TypeScript
const obj = { my: 'Special', variable: 42 }
const success = myCache.set('myKey', obj, 10000)
// true
```

> Note: If the key expires based on its `ttl` it will be deleted entirely from the internal data object.

## Store multiple keys (MSET):

`myCache.mset({key: Key, value: T, ttl?: number}[])`

Sets multiple `key` `val` pairs. It is possible to define a `ttl` (seconds).
Returns `true` on success.

```TypeScript
const obj = { my: 'Special', variable: 42 }
const obj2 = { my: 'other special', variable: 1337 }

const success = myCache.mset([
  { key: 'myKey', val: obj, ttl: 10000 },
  { key: 'myKey2', val: obj2 },
])
```

## Retrieve a key (GET):

`myCache.get(key)`

Gets a saved value from the cache. Returns a `undefined` if not found or expired.
If the value was found it returns the `value`.

```TypeScript
const value = myCache.get('myKey')
if (value === undefined) {
  // handle miss!
}
// { my: "Special", variable: 42 }
```

**Since `2.0.0`**:

The return format changed to a simple value and a `ENOTFOUND` error if not found (as result instance of `Error`)

**Since `2.1.0`**:

The return format changed to a simple value, but a due to discussion in #11 a miss shouldn't
return an error. So after 2.1.0 a miss returns `undefined`.

## Take a key (TAKE):

`myCache.take(key)`

Get the cached value and remove the key from the cache. Equivalent to calling `get(key)` + `del(key)`.
Useful for implementing `single use` mechanism such as OTP, where once a value is read it will become obsolete.

```TypeScript
myCache.set('myKey', 'myValue')
myCache.has('myKey')                // returns true because the key is cached right now
const value = myCache.take('myKey') // value === "myValue"; this also deletes the key
myCache.has('myKey')                // returns false because the key has been deleted
```

## Get multiple keys (MGET):

`myCache.mget([ key1, key2, ..., keyn ])`

Gets multiple saved values from the cache. Returns an empty object `{}` if no keys are found or are
expired. If the value was found it returns an object with the `key` `value` pair.

```TypeScript
const value = myCache.mget(['myKeyA', 'myKeyB', 'nonExistentKey', 'expiredKey'])
/*
	{
		"myKeyA": { my: "Special", variable: 123 },
		"myKeyB": { the: "Glory", answer: 42 }
	}
*/
```

**Since `2.0.0`**:

The method for mget changed from `.get([ "a", "b" ])` to `.mget([ "a", "b" ])`

## Delete a key (DEL):

`myCache.del(key)`

Delete a key. Returns the number of deleted entries. A delete will never fail.

```TypeScript
const value = myCache.del('A')
// 1
```

## Delete multiple keys (MDEL):

`myCache.del([ key1, key2, ..., keyn ])`

Delete multiple keys. Returns the number of deleted entries. A delete will never fail.

```TypeScript
const delResult1 = myCache.del('A')
// 1

const delResult2 = myCache.del(['B', 'C'])
// 2

const delResult3 = myCache.del(['A', 'B', 'C', 'D'])
// 1 - because A, B and C not exists
```

## Change TTL (TTL):

`myCache.ttl(key, ttl)`

Redefine the ttl of a key. Returns true if the key has been found and changed. Otherwise returns false.
If the ttl-argument isn't passed the default-TTL will be used.

The key will be deleted when passing in a `ttl < 0`.

```TypeScript
const myCache = new NodeCache<unknown>({ stdTTL: 100 })
const changed = myCache.ttl('existingKey', 100)
// true

const changed2 = myCache.ttl('missingKey', 100)
// false

const changed3 = myCache.ttl('existingKey')
// true
```

## Get TTL (getTTL):

`myCache.getTtl(key)`

Receive the ttl of a key. You will get:

- `undefined` if the key does not exist
- `0` if this key has no ttl
- a timestamp in ms representing the time at which the key will expire

```TypeScript
const myCache = new NodeCache<string>({ stdTTL: 100 })

// Date.now() = 1456000500000
myCache.set('ttlKey', 'MyExpireData')
myCache.set('noTtlKey', 'NonExpireData', 0)

const ts1 = myCache.getTtl('ttlKey')
// ts1 will be approximately 1456000600000

const ts2 = myCache.getTtl('ttlKey')
// ts2 wil be approximately 1456000600000

const ts3 = myCache.getTtl('noTtlKey')
// ts3 = 0

const ts4 = myCache.getTtl('unknownKey')
// ts4 = undefined
```

## List keys (KEYS)

`myCache.keys()`

Returns an array of all existing keys.

```TypeScript
const mykeys = myCache.keys()

console.log(mykeys)
// [ "all", "my", "keys", "foo", "bar" ]
```

## Has key (HAS)

`myCache.has(key)`

Returns boolean indicating if the key is cached.

```TypeScript
const myCache = new NodeCache<string>()
myCache.set('myKey', 'myValue')
const exists = myCache.has('myKey')
console.log(exists)
```

## Statistics (STATS):

`myCache.getStats()`

Returns the statistics.

```TypeScript
myCache.getStats()
/*
		{
			keys: 0,    // global key count
			hits: 0,    // global hit count
			misses: 0,  // global miss count
			ksize: 0,   // global key size count in approximately bytes
			vsize: 0    // global value size count in approximately bytes
		}
	*/
```

## Flush all data (FLUSH):

`myCache.flushAll()`

Flush all data.

```TypeScript
myCache.flushAll()
myCache.getStats()
/*
		{
			keys: 0,    // global key count
			hits: 0,    // global hit count
			misses: 0,  // global miss count
			ksize: 0,   // global key size count in approximately bytes
			vsize: 0    // global value size count in approximately bytes
		}
	*/
```

## Flush the stats (FLUSH STATS):

`myCache.flushStats()`

Flush the stats.

```TypeScript
myCache.flushStats()
myCache.getStats()
/*
		{
			keys: 0,    // global key count
			hits: 0,    // global hit count
			misses: 0,  // global miss count
			ksize: 0,   // global key size count in approximately bytes
			vsize: 0    // global value size count in approximately bytes
		}
	*/
```

## Close the cache:

`myCache.close()`

Clear the timeout interval which is set on check period option.

```TypeScript
myCache.close()
```

# Events

## set

Fired when a key has been added or changed. You will get the `key` and the `value` as callback argument.

```TypeScript
myCache.on('set', (key: Key, value: T) => {
  // ... do something ...
})
```

## del

Fired when a key has been removed manually or due to expiry.
You will get the `key` and the deleted `value` as callback arguments.

```TypeScript
myCache.on('del', (key: Key, value: T) => {
  // ... do something ...
})
```

## expired

Fired when a key expires.
You will get the `key` and `value` as callback argument.

```TypeScript
myCache.on('expired', (key: Key, value: T) => {
  // ... do something ...
})
```

## flush

Fired when the cache has been flushed.

```TypeScript
myCache.on('flush', () => {
  // ... do something ...
})
```

## flush_stats

Fired when the cache stats has been flushed.

```TypeScript
myCache.on('flush_stats', () => {
  // ... do something ...
})
```

# The MIT License (MIT)

Copyright © 2019 Mathias Peter and the node-cache maintainers, https://github.com/node-cache/node-cache

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
