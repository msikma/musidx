// musidx <https://github.com/msikma/musidx>
// © MIT license

import fs, {constants} from 'fs/promises'

/** List of common audio file extensions that we can extract metadata from. */
export const AUDIO_EXTS = [
  'aac',  'aiff', 'alac',
  'ape',  'flac', 'm4a',
  'mp3',  'mp4',  'ogg',
  'opus', 'wav',  'wma'
]

/**
 * Returns a glob pattern for common audio file types.
 */
export function getAudioFileGlob() {
  return AUDIO_EXTS.map(ext => `**/*.${ext}`)
}

/**
 * Checks whether a certain access level applies to a given file path.
 * 
 * This checks whether a file is readable, writable or visible and returns a boolean.
 */
async function fileAccessCheck(filepath, access) {
  try {
    return await fs.access(filepath, access) == null
  }
  catch (err) {
    // If the file does not exist or we don't have permission for a given access level, return false.
    if (err.code === 'ENOENT' || err.code === 'EACCES') {
      return false
    }
    // Otherwise, something unexpected went wrong that the caller should know about.
    throw err
  }
}

/** Checks whether a file or path exists. */
export const fileExists = filepath => fileAccessCheck(filepath, constants.F_OK)
/** Checks whether a file or path is writable. */
export const fileIsWritable = filepath => fileAccessCheck(filepath, constants.W_OK)
/** Checks whether a file or path is readable. */
export const fileIsReadable = filepath => fileAccessCheck(filepath, constants.R_OK)
