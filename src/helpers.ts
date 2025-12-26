/**
 * Generates a random string of given length.
 * @param length - The length of the string to generate
 * @param withnumbers - Whether to include numbers (default: true)
 * @returns A random string
 */
export function randomString(
  length: number = 5,
  withnumbers: boolean = true,
): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' +
    (withnumbers ? '0123456789' : '')
  let randomstring = ''
  let i = 0
  while (i < length) {
    let rnum = Math.floor(Math.random() * chars.length)
    randomstring += chars.substring(rnum, rnum + 1)
    i++
  }
  return randomstring
}

/**
 * Generates a random number between 0 and max (inclusive).
 * @param max - The maximum value
 * @returns A random number between 0 and max
 */
export function randomNumber(max: number): number {
  return Math.floor(Math.random() * (max + 1))
}

/**
 * Subtracts all values in objB from the corresponding values in objA.
 * Both objects should have identical keys with numeric values.
 * @param objA - The first object (will be subtracted from)
 * @param objB - The second object (values to subtract)
 * @returns An object with the difference of values
 */
export function diffStats<T>(
  objA: Record<keyof T, number>,
  objB: Record<keyof T, number>,
): Record<keyof T, number> {
  let diff: Record<keyof T, number> = structuredClone(objA)
  for (const [key, value] of Object.entries(diff) as [keyof T, number][]) {
    diff[key] = value - objB[key]
  }
  return diff
}

/**
 * Wait for a specified number of milliseconds.
 * @param ms - The number of milliseconds to wait
 * @returns A Promise that resolves after the specified time
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(() => resolve(), ms))
}
