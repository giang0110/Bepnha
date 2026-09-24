/*
 * Bếp Nhà service worker.
 *
 * Written by hand rather than generated, because the whole point is to be able to say exactly what
 * is stored on a device and when it is thrown away. A generated precache manifest would also have
 * to be wired into the build, and this app is small enough not to need one: the shell is cached the
 * first time it is fetched, so the second visit works with no signal.
 *
 * What is cached, and why each is separate:
 *
 * `bepnha-shell` holds the app's own files — the HTML entry, the hashed JS and CSS, the fonts and
 * icons. None of it is about any particular household, so it survives signing out.
 *
 * `bepnha-data` holds authenticated GET responses, today only the current week's plan. This *is*
 * household data, so the page deletes this cache on sign-out and nothing else ever writes to it.
 * Nothing cross-origin is touched at all: the Supabase calls carry their own tokens and are left to
 * the network, which also means the shopping list is not covered here — it is an RPC POST, and the
 * Cache API cannot store a POST.
 *
 * Kitchens and markets are where the signal is worst, which is the entire reason this exists.
 */

const VERSION = "v1"
const SHELL_CACHE = `bepnha-shell-${VERSION}`
const DATA_CACHE = `bepnha-data-${VERSION}`
const OFFLINE_URL = "/index.html"

const PRECACHE = [OFFLINE_URL, "/manifest.webmanifest", "/icons/icon-192.png"]

/**
 * Build output, whose file names carry a content hash.
 *
 * Safe to serve from cache and never re-check: a changed file is a different name, so a stale hit
 * is impossible by construction.
 */
function isImmutableAsset(url) {
  return url.pathname.startsWith("/assets/")
}

/**
 * App files whose names never change — the fonts, the icons, the manifest.
 *
 * These cannot be cache-first, because cache-first on a fixed name means a new icon or a corrected
 * manifest never reaches anyone who already visited. They are served from cache for speed and
 * refreshed in the background, so the next visit has the new one.
 */
function isRevalidatedAsset(url) {
  return (
    url.pathname.startsWith("/fonts/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  )
}

/** The reads worth having offline. Kept to an explicit list so nothing is stored by accident. */
function isCacheableRead(url) {
  return url.pathname === "/api/plans/current"
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

/*
 * Signing out has to take the household's data with it. The page asks; the worker is the only thing
 * that can answer, because it owns the cache.
 */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "bepnha:purge-data") {
    event.waitUntil(caches.delete(DATA_CACHE))
  }
})

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(cacheName)
      await cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    const cached = await caches.match(request)
    if (cached !== undefined) return cached
    throw error
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE)
  const cached = await cache.match(request)
  if (cached !== undefined) return cached
  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}

/**
 * Answer from cache at once, and replace it for next time.
 *
 * The refresh is deliberately not awaited before answering: a cook opening the app on a slow
 * connection should not wait on a font they already have. It is also deliberately not fatal — the
 * whole point is that this path works offline.
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE)
  const cached = await cache.match(request)
  const refresh = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone())
      return response
    })
    .catch(() => undefined)
  if (cached !== undefined) return cached
  const response = await refresh
  return response ?? Response.error()
}

/**
 * The shell a navigation falls back to, kept current.
 *
 * Writing the fresh document back into the cache is the whole point. Without it the offline copy is
 * whatever was precached on the very first visit, forever: every later deploy reaches people online
 * and nobody offline, so an installed app keeps serving a version that no longer exists — including
 * its bugs. Proven by putting a changed index.html behind a running worker and watching the offline
 * navigation still render the old one.
 */
async function navigationWithShellRefresh(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE)
      await cache.put(OFFLINE_URL, response.clone())
    }
    return response
  } catch (error) {
    const cache = await caches.open(SHELL_CACHE)
    const cached = await cache.match(OFFLINE_URL)
    if (cached !== undefined) return cached
    throw error
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // A navigation must always land somewhere. Offline, that is the cached shell, which then renders
  // whatever the pages can read for themselves — and which every online navigation keeps current.
  if (request.mode === "navigate") {
    event.respondWith(
      navigationWithShellRefresh(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL)
        return cached ?? Response.error()
      })
    )
    return
  }

  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(request))
    return
  }

  if (isRevalidatedAsset(url)) {
    event.respondWith(staleWhileRevalidate(request))
    return
  }

  if (isCacheableRead(url)) {
    event.respondWith(networkFirst(request, DATA_CACHE))
  }
})
