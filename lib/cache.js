// musidx <https://github.com/msikma/musidx>
// © MIT license

import fs from 'fs/promises'
import {gzip, gunzip} from './gzip.js'

/**
 * Reads and returns the existing cache.
 */
export async function readCache(filepath) {
  try {
    const data = JSON.parse(await gunzip(await fs.readFile(`${filepath}.gz`, null)))
    return data
  }
  catch (err) {
    // If the cache file doesn't exist, ignore; we'll save cache after this indexing cycle.
    if (err.code === 'ENOENT') {
      return {}
    }
    // This happens if the JSON file is somehow corrupted. Just rewrite it from scratch.
    if (err.name === 'SyntaxError') {
      return {}
    }
    // If something completely different happened, don't catch it.
    throw err
  }
}

/**
 * Writes data back to the cache.
 */
export async function writeCache(filepath, data) {
  return fs.writeFile(`${filepath}.gz`, await gzip(JSON.stringify(data, null, 2)), null)
}
