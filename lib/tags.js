// musidx <https://github.com/msikma/musidx>
// © MIT license

import pick from 'lodash.pick'
import {parseFile} from 'music-metadata'
import {getMetadataHacks} from './hacks.js'

/** Tags that are always available. */
const COMMON_TAGS = [
  'title',
  'album',
  'artists',
  'albumartist',
  'genre',
  'year',
  'rating',
  'track',
  'disk',
  'replaygain_album_gain',
  'replaygain_album_peak',
  'replaygain_track_gain',
  'replaygain_track_peak',
]

const FORMAT_TAGS = [
  'container',
  'codec',
  'duration',
  'sampleRate',
  'bitsPerSample',
  'numberOfChannels',
  'lossless',
]

/**
 * Returns only the common tags that we need.
 */
function pickCommonTags(common) {
  if (!common.artists) {
    common.artists = [common.artist]
  }
  if (!common.albumartist) {
    common.albumartist = common.artist
  }
  if (Array.isArray(common.albumartist)) {
    common.albumartist = common.albumartist[0]
  }
  return pick(common ?? {}, COMMON_TAGS)
}

/**
 * Returns only the format tags that we need.
 */
function pickFormatTags(format) {
  return pick(format ?? {}, FORMAT_TAGS)
}

/**
 * Converts a Winamp rating value to a string value 0-100.
 */
function getMp3WinampRating(value) {
  const stars = Math.round(value / 0.25) + 1
  return String(stars * 20)
}

/**
 * Performs various cleaning tasks on the obtained tags.
 */
function cleanTags(tags) {
  if (tags.rating && !Array.isArray(tags.rating)) {
    tags.rating = [tags.rating]
  }
  if (tags.rating?.[0]?.source) {
    if (tags.rating[0].source === 'rating@winamp.com') {
      tags.rating = [getMp3WinampRating(tags.rating[0].rating)]
    }
  }
  return tags
}

/**
 * Returns additional tags extracted for specific categories.
 */
function pickCategoryTags(tags, category) {
  if (!category || !category.categoryTags) {
    return {}
  }
  return category.categoryTags.map(tags)
}

export async function processTags(ext, fn, filepath, category) {
  const data = await parseFile(filepath)
  const common = pickCommonTags(data.common)
  const format = pickFormatTags(data.format)
  const additional = pickCategoryTags(data, category)
  const hacks = await getMetadataHacks(ext, fn, filepath, common)
  const tags = cleanTags({...common, ...hacks})
  return {
    tags,
    category: additional,
    format
  }
}
