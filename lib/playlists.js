// musidx <https://github.com/msikma/musidx>
// © MIT license

import fs from 'fs/promises'
import path from 'path'
import xml2js from 'xml2js'
import m3u8Parser from 'm3u8-parser'

/**
 * Returns the raw XML data for a given playlists.xml file.
 */
async function parsePlaylistsXml(plBase) {
  const plXml = path.join(plBase, 'playlists.xml')

  const xml = await fs.readFile(plXml, 'utf-16le')
  const res = await xml2js.parseStringPromise(xml)

  return res
}

/**
 * Returns a Win32 path converted to Unix.
 */
function getTrackPath(uri, baseDir) {
  const parsed = path.win32.parse(uri)
  const rel = path.win32.relative(baseDir, parsed.dir)
  const parts = rel.split(path.win32.sep)
  return [...parts, parsed.base].join(path.sep)
}

/**
 * Returns track data.
 */
function getTrackData(segment, baseDir) {
  const filepath = getTrackPath(segment.uri, baseDir)
  return {
    file: filepath
  }
}

/**
 * Returns the parsed XML data for a playlist file.
 * 
 * Tracks have their Win32 filenames changed to Unix paths.
 */
async function getPlaylistData(playlist, plBase, win32BaseDir) {
  const parser = new m3u8Parser.Parser()
  const data = await fs.readFile(path.join(plBase, playlist.filename), 'utf8')
  parser.push(data)
  parser.end()
  const tracks = (parser.manifest.segments ?? []).map(segment => getTrackData(segment, win32BaseDir))
  return {
    title: playlist.title,
    file: playlist.filename,
    id: playlist.id,
    tracks
  }
}

/**
 * Returns all playlists defined in the Winamp Media Library that meets our profile.
 * 
 * Only playlist track file paths are included.
 */
export async function findPlaylists(waPath, playlistProfile) {
  const plBase = path.join(waPath, 'Plugins', 'ml', 'playlists')
  const xmlData = await parsePlaylistsXml(plBase)
  const allPlaylists = xmlData.playlists.playlist.map(pl => pl.$)
  const filteredPlaylists = await Promise.all(
    allPlaylists
      .filter(playlistProfile.filter)
      .map(playlist => playlistProfile.map(playlist))
      .map(playlist => getPlaylistData(playlist, plBase, playlistProfile.win32BaseDir)))
  return filteredPlaylists
}
