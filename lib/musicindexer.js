// musidx <https://github.com/msikma/musidx>
// © MIT license

import fs from 'fs/promises'
import fg from 'fast-glob'
import path from 'path'
import pick from 'lodash.pick'
import compact from 'lodash.compact'
import omit from 'lodash.omit'
import orderBy from 'lodash.orderby'
import cloneDeep from 'lodash.clonedeep'
import {readCache, writeCache} from './cache.js'
import {processTags} from './tags.js'
import {getAudioFileGlob, fileExists} from './util.js'
import {findPlaylists} from './playlists.js'

/** Applies compact() on objects. */
const compactObject = obj => (
  Object.fromEntries(compact(Object.entries(obj).map(([key, value]) => value ? [key, value] : null)))
)

/** Symbol for items that do not belong to any taxonomy type; e.g., no category, no album, etc. */
const NONE = '__NONE__'

export function MusicIndexer({fileCachePath, mlCachePath, waPath = null} = {}) {
  const state = {
    data: null,
    ml: null,
    freshThreshold: 604800 * 2
  }

  /** Returns an array of all audio files in the given music path. */
  async function findFiles(musicPath) {
    const files = await fg([...getAudioFileGlob()], {cwd: musicPath, onlyFiles: true, unique: true})
    return files.sort()
  }

  /** Returns whether this file's previous entry is fresh enough that it can be skipped. */
  async function isFresh(file, filepath) {
    const fdata = state.data[file] ?? {}
    const stat = await fs.stat(filepath)
    return [fdata.mtime != null && fdata.mtime === stat.mtimeMs, stat.mtimeMs]
  }

  /** Returns the basedir that this file is in. */
  function getBaseDir(file) {
    const rel = file.startsWith('/') ? file.slice(1) : file
    const segments = rel.split('/')
    return segments[0]
  }

  /** Returns the category that this file applies to. */
  function getCategory(file, categories) {
    const basedir = getBaseDir(file)
    const category = categories.find(cat => cat.basedir === basedir)
    return category
  }

  /**
   * Reads tags for a specific file.
   */
  async function processFile(musicPath, file, categories, options = {}) {
    const filepath = path.join(musicPath, file)
    const [fresh, mtime] = await isFresh(file, filepath)
    if (fresh && !options.forceRefresh) {
      return {skipped: true}
    }
    const ext = path.extname(file.toLowerCase()).slice(1)
    const category = getCategory(file, categories)
    
    state.data[file] = {
      ...await processTags(ext, file, filepath, category),
      meta: {
        category: category?.code,
      },
      file,
      time: Number(new Date()),
      mtime,
      ext
    }

    return {skipped: false}
  }

  /**
   * Iterates through all audio files and reads their tags.
   */
  async function processFiles(musicPath, files, categories, options = {}) {
    for (const file of files) {
      if (options.printSpeed) console.time('file')
      try {
        const res = await processFile(musicPath, file, categories, options)
        if (options.printSpeed) {
          if (res.skipped) console.log('(skipped)')
          console.timeEnd('file')
        }
      }
      catch (err) {
        state.data[file] = {
          error: String(err)
        }
        if (options.printSpeedd) {
          console.log('(error)')
          console.timeEnd('file')
        }
      }
    }
  }

  /**
   * Checks all files to ensure they all exist. If not, removes them.
   */
  async function checkFileExistence(musicPath) {
    for (const [key, value] of Object.entries(state.data)) {
      const filepath = path.join(musicPath, value.file)
      const exists = await fileExists(filepath)
      if (exists) {
        continue
      }

      // Remove the file from the database.
      delete state.data[key]
    }
  }

  /**
   * Sorts the files in an album.
   * 
   * This is performed on the last leaf in a collectMediaLibraryTaxonomy() run.
   */
  function sortAlbumFiles(dataFiles) {
    return Object.fromEntries(
      orderBy(Object.entries(dataFiles), ['1.tags.disk.no', '1.tags.track.no', '1.file', '1.tags.title'], ['asc', 'asc', 'asc', 'asc'])
    )
  }

  /**
   * Sorts the items in a taxonomy collection.
   */
  function sortTaxonomyItems(collectionItems) {
    return Object.fromEntries(
      orderBy(Object.entries(collectionItems), ['0'], ['asc'])
    )
  }

  /**
   * Returns a taxonomy value for a given key.
   */
  function getTaxonomyValue(tags, key) {
    // Keys can have __or__, e.g. albumartist__or__artists. We'll return the first match.
    const keyItems = key.split('__or__')
    for (const keyItem of keyItems) {
      const value = tags[keyItem]
      const isArray = Array.isArray(value)
      if ((!isArray && value) || (isArray && value[0])) {
        return isArray ? value[0] : value
      }
    }
    return NONE
  }

  /**
   * Returns files reorganized per a category taxonomy.
   * 
   * Recurses for items in the category's taxonomy list.
   */
  function collectMediaLibraryTaxonomy(dataFiles, taxKey, remainingTaxKeys = []) {
    const items = {}

    for (const [key, file] of Object.entries(dataFiles)) {
      const tags = {...file.tags, ...file.category}
      const taxData = getTaxonomyValue(tags, taxKey)
      if (!items[taxData]) {
        items[taxData] = {
          key: taxKey,
          data: taxData,
          isNullCollection: taxData === NONE,
          items: {}
        }
      }
      items[taxData].items[key] = file
    }

    if (remainingTaxKeys.length) {
      for (const [key, item] of Object.entries(items)) {
        items[key].items = sortTaxonomyItems(collectMediaLibraryTaxonomy(item.items, remainingTaxKeys[0], remainingTaxKeys.slice(1)))
      }
    }
    else {
      for (const [key, item] of Object.entries(items)) {
        items[key].isEndNode = true
        items[key].items = sortAlbumFiles(item.items)

        const firstFile = Object.keys(item.items)?.[0]
        if (firstFile) {
          const firstItem = item.items[firstFile]
          items[key].tags = omit({...firstItem.tags, ...firstItem.category}, ['title', 'track', 'disk'])
        }
      }
    }

    return items
  }

  /**
   * Filters the items in a category taxonomy.
   * 
   * This recurses into taxonomy nodes until it finds files, and then it filters those.
   */
  function filterMediaLibraryTaxonomy(items, filterFunction) {
    for (let [key, item] of Object.entries(items)) {
      // If this is an end node, it means we've reached the actual files.
      if (item.isEndNode) {
        // Filter out the files that aren't relevant.
        const fileEntries = Object.entries(item.items).filter(([key, file]) => filterFunction(file))
        item.items = Object.fromEntries(fileEntries)

        // If the node is empty after filtering (i.e. there were no matching files), remove the entire item.
        if (fileEntries.length === 0) {
          items[key] = null
          continue
        }
      }
      else {
        item.items = filterMediaLibraryTaxonomy(item.items, filterFunction)
        if (Object.keys(item.items).length === 0) {
          items[key] = null
          continue
        }
      }
    }

    return compactObject(items)
  }

  /**
   * Returns all files that pertain to a given category.
   */
  function getCategoryFiles(category, dataFiles) {
    return Object.fromEntries(Object.entries(dataFiles).filter(([key, file]) => file.meta?.category === category.code))
  }

  /**
   * Reorganizes files after their tags have been ascertained.
   * 
   * This groups the files together based on a number of custom factors.
   */
  async function catalogueMediaLibrary(categories) {
    let primaryCategories = categories.filter(cat => cat.basedir)
    let secondaryCategories = categories.filter(cat => !cat.basedir)

    primaryCategories = compact(primaryCategories.map(cat => {
      const taxKeys = cat.taxonomy
      if (!taxKeys?.length) {
        return null
      }
      return {
        type: 'primary',
        ...pick(cat, ['name', 'code', 'taxonomy', 'sort']),
        items: collectMediaLibraryTaxonomy(getCategoryFiles(cat, state.data), taxKeys[0], taxKeys.slice(1))
      }
    }))
    
    secondaryCategories = compact(secondaryCategories.map(cat => {
      const baseCategory = primaryCategories.find(pCat => pCat.code === cat.inherits)
      if (!baseCategory) {
        return null
      }
      return {
        type: 'secondary',
        ...pick({...baseCategory, ...cat}, ['name', 'code', 'inherits', 'taxonomy', 'sort']),
        items: filterMediaLibraryTaxonomy(cloneDeep(baseCategory.items), cat.filter)
      }
    }))
    
    state.ml = {
      ...(state.ml ?? {}),
      categories: [...primaryCategories, ...secondaryCategories]
    }
  }

  async function importPlaylists(waPath, playlistProfile) {
    const playlists = await findPlaylists(waPath, playlistProfile)
    const pl = playlists.map(playlist => ({
      ...playlist,
      tracks: playlist.tracks.map(track => {
        const info = state.data[track.file]
        return info
      })
    }))
    state.ml = {
      ...(state.ml ?? {}),
      playlists
    }
  }

  async function indexPath(musicPath, {profile, addPlaylists = true, onlyProfile = false, forceRefresh = false, printSpeed = false} = {}) {
    state.data = await readCache(fileCachePath)
    if (!onlyProfile) {
      const files = await findFiles(musicPath)
      await processFiles(musicPath, files, profile.categories, {forceRefresh, printSpeed})
      await checkFileExistence(musicPath)
      await writeCache(fileCachePath, state.data)
    }
    await catalogueMediaLibrary(profile.categories)
    await importPlaylists(waPath, profile.playlists)
    await writeCache(mlCachePath, state.ml)
  }

  return {
    indexPath
  }
}
