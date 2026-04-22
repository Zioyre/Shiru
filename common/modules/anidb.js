import { writable } from 'simple-store-svelte'
import Bottleneck from 'bottleneck'

import { adbToken, settings } from '@/modules/settings.js'
import { getRandomInt, sleep } from '@/modules/util.js'
import { printError, status } from '@/modules/networking.js'
import { cache, caches, mediaCache } from '@/modules/cache.js'
import Debug from 'debug'
const debug = Debug('ui:anidb')

const PROXY_BASE_URL = (() => {
  try {
    return settings.value?.adbProxyURL || 'http://localhost:8459'
  } catch {
    return 'http://localhost:8459'
  }
})()

const ANIDB_STATUS_MAP = {
  CURRENT: 'CURRENT',
  PLANNING: 'PLANNING',
  COMPLETED: 'COMPLETED',
  DROPPED: 'DROPPED',
  PAUSED: 'PAUSED',
  REPEATING: 'REPEATING'
}

class AnidbClient {
  limiter = new Bottleneck({
    reservoir: 30,
    reservoirRefreshAmount: 30,
    reservoirRefreshInterval: 60 * 1_000,
    maxConcurrent: 5,
    minTime: 200
  })

  rateLimitPromise = null

  /** @type {import('simple-store-svelte').Writable<ReturnType<AnidbClient['getUserLists']>>} */
  userLists = writable()

  userID = adbToken

  constructor () {
    debug('Initializing AniDB Client for ' + this.userID?.viewer?.data?.Viewer?.name)
    this.limiter.on('failed', async (error) => {
      if (status.value.match(/offline/i)) throw new Error('Failed making request to AniDB proxy, network is offline... not retrying')
      else await printError('Search Failed', 'Failed making request to AniDB proxy!\nTry again in a minute.', error)
      if (error.status === 500) return 1

      if (!error.statusText) {
        if (!this.rateLimitPromise) this.rateLimitPromise = sleep(61 * 1_000).then(() => { this.rateLimitPromise = null })
        return 61 * 1_000
      }
      const time = (Number((error.headers.get('retry-after') || 60)) + 1) * 1_000
      if (!this.rateLimitPromise) this.rateLimitPromise = sleep(time).then(() => { this.rateLimitPromise = null })
      return time
    })

    if (this.userID?.viewer?.data?.Viewer) {
      this.userLists.value = this.getUserLists({ sort: 'UPDATED_TIME_DESC' }, true)
      setTimeout(() => {
        this.getUserLists({ sort: 'UPDATED_TIME_DESC' }).then(updatedLists => {
          this.userLists.value = Promise.resolve(updatedLists)
        }).catch(error => debug('Failed to update user lists on init, this is likely a temporary connection issue:', error))
      }).unref?.()
      // update userLists every 15 mins
      setInterval(() => {
        this.getUserLists({ sort: 'UPDATED_TIME_DESC' }).then(updatedLists => {
          this.userLists.value = Promise.resolve(updatedLists)
        }).catch(error => debug('Failed to update user lists at the scheduled interval, this is likely a temporary connection issue:', error))
      }, 1_000 * 60 * 15)
    }
  }

  numberOfQueries = 0

  /** @param {string} path
   *  @param {RequestInit} [opts]
   *  @returns {Promise<any>}
   */
  handleRequest = this.limiter.wrap(async (path, opts = {}) => {
    await this.rateLimitPromise
    debug(`[${this.numberOfQueries}] requesting`, path)
    this.numberOfQueries++
    if (status.value.match(/offline/i)) throw new Error('AniDB proxy is temporarily disabled or network is offline')

    const url = `${PROXY_BASE_URL}${path}`
    let res = {}
    try {
      res = await fetch(url, opts)
    } catch (e) {
      if (!res || res.status !== 404) throw e
    }
    if (!res.ok && (res.status === 429 || res.status === 500)) {
      throw res
    }
    let json = null
    try {
      json = await res.json()
    } catch (error) {
      if (res.ok) printError('Search Failed', 'Failed making request to AniDB proxy!\nTry again in a minute.', error)
    }
    if (!res.ok && res.status !== 404) {
      if (json?.error) {
        printError('Search Failed', 'Failed making request to AniDB proxy!\nTry again in a minute.', json.error)
      } else {
        printError('Search Failed', 'Failed making request to AniDB proxy!\nTry again in a minute.', res)
      }
    }
    return json || res
  })

  async auth (username, password) {
    debug('Authenticating with AniDB proxy')
    const res = await this.handleRequest('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    if (res?.error) {
      throw new Error(res.error)
    }
    if (!res?.token || !res?.viewer) {
      throw new Error('Invalid response from AniDB proxy')
    }
    return { token: res.token, viewer: { data: { Viewer: res.viewer } }, user: username, pass: password }
  }

  async logout () {
    if (!this.userID?.token) return
    debug('Logging out from AniDB proxy')
    try {
      await this.handleRequest('/api/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: this.userID.token })
      })
    } catch (e) {
      debug('Logout error:', e.message)
    }
  }

  /** @returns {Promise<import('./adb.d.ts').Query<{ Viewer: import('./adb.d.ts').Viewer }>>} */
  viewer (token) {
    debug('Getting viewer')
    // Viewer is already cached in token, but we can verify with proxy if needed
    if (token) {
      return Promise.resolve({ data: { Viewer: token.viewer.data.Viewer } })
    }
    return Promise.resolve(this.userID?.viewer)
  }

  /** @returns {Promise<import('./adb.d.ts').Query<{ MediaListCollection: import('./adb.d.ts').MediaListCollection }>>} */
  async getUserLists (variables = {}, ignoreExpiry = false, ignoreCache = false) {
    debug('Getting user lists')
    if (!this.userID?.token) {
      return { data: { MediaListCollection: { lists: [] } } }
    }

    const res = await this.handleRequest(`/api/mylist?token=${this.userID.token}`)
    if (!res?.data?.lists) {
      return { data: { MediaListCollection: { lists: [] } } }
    }

    // Collect all aids from all lists
    const allAids = new Set()
    for (const list of Object.values(res.data.lists)) {
      for (const entry of list) {
        allAids.add(entry.aid)
      }
    }

    // Map AIDs to AniList IDs
    const aidToAnilistId = new Map()
    const missingAids = []
    for (const aid of allAids) {
      const cached = cache.cachedEntry(caches.MAPPINGS, `adb-${aid}`, ignoreExpiry)
      if (cached?.anilist_id) {
        aidToAnilistId.set(aid, cached.anilist_id)
      } else {
        missingAids.push(aid)
      }
    }

    // Fetch missing mappings from ani.zip
    if (missingAids.length > 0) {
      debug(`Fetching ${missingAids.length} missing AID mappings from ani.zip`)
      for (const aid of missingAids) {
        try {
          const mappingRes = await fetch(`https://api.ani.zip/mappings?anidb_id=${aid}`)
          if (!mappingRes.ok) continue
          const mappingJson = await mappingRes.json()
          const anilistId = mappingJson?.mappings?.anilist_id
          if (anilistId) {
            aidToAnilistId.set(aid, anilistId)
            cache.cacheEntry(caches.MAPPINGS, `adb-${aid}`, {}, { anilist_id: anilistId }, Date.now() + 30 * 24 * 60 * 60 * 1_000)
            cache.cacheEntry(caches.MAPPINGS, `adb-ani-${anilistId}`, {}, { aid }, Date.now() + 30 * 24 * 60 * 60 * 1_000)
          }
        } catch (e) {
          debug(`Failed to fetch mapping for AID ${aid}:`, e.message)
        }
      }
    }

    // Collect AniList IDs
    const anilistIds = [...aidToAnilistId.values()].filter(Boolean)
    if (anilistIds.length === 0) {
      return { data: { MediaListCollection: { lists: [] } } }
    }

    // Fetch AniList media in batches
    const { anilistClient } = await import('./anilist.js')
    const alRes = await anilistClient.searchIDS({ id: anilistIds })
    const mediaById = new Map()
    for (const media of alRes?.data?.Page?.media || []) {
      mediaById.set(media.id, media)
    }

    // Build normalized lists
    const lists = []
    for (const [statusKey, entries] of Object.entries(res.data.lists)) {
      if (!entries?.length) continue
      const mappedEntries = []
      for (const entry of entries) {
        const anilistId = aidToAnilistId.get(entry.aid)
        if (!anilistId) continue
        const media = mediaById.get(anilistId)
        if (!media) continue

        mappedEntries.push({
          media,
          progress: entry.progress || 0,
          score: 0, // AniDB mylistsummary doesn't include score; votes are separate
          status: ANIDB_STATUS_MAP[statusKey] || 'CURRENT',
          repeat: 0,
          updatedAt: 0 // Not provided by AniDB mylistsummary
        })
      }
      if (mappedEntries.length > 0) {
        lists.push({
          status: statusKey,
          entries: mappedEntries
        })
      }
    }

    return { data: { MediaListCollection: { lists } } }
  }

  /** @param {Record<string, any>} variables */
  async entry (variables) {
    debug(`Updating entry for media ${variables.id}`)
    // Reverse-map AniList ID -> AID
    const cachedMapping = cache.cachedEntry(caches.MAPPINGS, `adb-ani-${variables.id}`)
    let aid = cachedMapping?.aid
    if (!aid) {
      debug(`No cached AID for AniList ID ${variables.id}, cannot update entry`)
      throw new Error('No AniDB mapping found for this anime')
    }

    const { status, episode, score } = variables
    const body = {
      token: this.userID.token,
      aid,
      status,
      episode: episode || 0
    }
    if (score != null) {
      body.score = score / 10 // AniList score is 0-1000 internally but displayed 0-10; AniDB vote is 100-1000
    }

    const res = await this.handleRequest('/api/entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (score != null && !res?.error) {
      // Also submit vote
      try {
        await this.handleRequest('/api/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: this.userID.token,
            aid,
            score: score / 10
          })
        })
      } catch (e) {
        debug('Vote submission failed:', e.message)
      }
    }

    return { data: { SaveMediaListEntry: { ...res?.data, progress: episode, status, score: score || 0 } } }
  }

  /** @param {Record<string, any>} variables */
  async delete (variables) {
    debug(`Deleting entry for media ${variables.id}`)
    // Reverse-map AniList ID -> AID
    const cachedMapping = cache.cachedEntry(caches.MAPPINGS, `adb-ani-${variables.id}`)
    let aid = cachedMapping?.aid
    if (!aid) {
      debug(`No cached AID for AniList ID ${variables.id}, cannot delete entry`)
      throw new Error('No AniDB mapping found for this anime')
    }
    const res = await this.handleRequest('/api/entry', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: this.userID.token,
        aid
      })
    })
    return res
  }
}

export const anidbClient = new AnidbClient()
