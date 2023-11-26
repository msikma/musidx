// musidx <https://github.com/msikma/musidx>
// © MIT license

import zlib from 'zlib'
import {promisify} from 'util'

const gzipBase = promisify(zlib.gzip)

export const gunzip = promisify(zlib.gunzip)
export const gzip = (buffer, opts = {}) => gzipBase(buffer, {level: zlib.constants.Z_BEST_SPEED, ...opts})
