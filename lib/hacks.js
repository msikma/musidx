// musidx <https://github.com/msikma/musidx>
// © MIT license

import fs from 'fs/promises'

const M4A_MAGIC_OFFSET = 4
const M4A_MAGIC_BYTES = Buffer.from('ftypM4A', 'ascii')

const HACKABLE_EXTS = ['m4a']

/**
 * Removes all characters under 0x20 from a string.
 * 
 * Optimized only for small strings.
 */
function cleanString(str) {
  return str.replace(/[\x00-\x1F]+/g, '')
}

/**
 * Checks whether a file is a valid M4A file.
 * 
 * This requires that the file is at least 11 bytes in size, and has "ftypM4a" at offset 4.
 */
function isM4aFile(buffer) {
  const end = M4A_MAGIC_BYTES.length + M4A_MAGIC_OFFSET
  
  if (buffer.length < end) {
    return false
  }

  return buffer.slice(4, end).equals(M4A_MAGIC_BYTES)
}

/**
 * Finds and extracts the Winamp rating for an M4A file.
 * 
 * We check for the "rate\x00\x00\x00" value and then grab the value at the given offset.
 * This is a very quick and dirty way to grab the rating that Winamp bestows on these files,
 * which does not seem to work according to the spec.
 * 
 * 
 */
function findM4aWinampRatingData(buffer) {
  // Check if this is a valid M4A file.
  if (!isM4aFile(buffer)) {
    return
  }
  
  // The "rate" pattern applied by Winamp.
  const rate = Buffer.from('rate\x00\x00\x00', 'ascii')
  
  for (let n = 0; n < buffer.length - rate.length; n++) {
    // Check if we've found the "rate" pattern.
    if (!buffer.slice(n, n + rate.length).equals(rate)) {
      continue
    }

    // Determine the offset of the actual rating; it's the "rate" pattern offset plus the value found here.
    const offset = buffer.readUInt8(n + rate.length)
    
    // Check that the file doesn't end prematurely.
    if (n + offset + 4 > buffer.length) {
      continue
    }
    
    // Extract 4 bytes at the calculated offset plus 1.
    const rateValue = buffer.slice(n + offset + 1, n + offset + 4)
    return {
      offset,
      value: cleanString(rateValue.toString('ascii'))
    }
  }

  return null
}

/**
 * Finds and extracts the Winamp rating for an M4A file and cleans it before returning it.
 * 
 * This returns the value as a number between 0 and 1.
 */
function findM4aWinampRating(buffer) {
  const data = findM4aWinampRatingData(buffer)
  if (data == null) {
    return {}
  }
  return {
    rating: [String(data.value).trim()]
  }
}

/**
 * Extracts additional data from the files using hackish methods.
 */
export async function getMetadataHacks(ext, fn, filepath, tags) {
  if (!HACKABLE_EXTS.includes(ext)) {
    return {}
  }
  const buffer = await fs.readFile(filepath, null)
  const m4aWinampRating = findM4aWinampRating(buffer)

  return {
    ...m4aWinampRating
  }
}
