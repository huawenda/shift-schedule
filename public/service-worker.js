const CACHE_NAME = 'shift-schedule-shell-v6'
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url)

  if (requestUrl.origin !== self.location.origin) return
  if (event.request.method !== 'GET') return

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const responseCopy = response.clone()
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseCopy)
        })
        return response
      })
      .catch(() => caches.match(event.request).then(response => response || caches.match('/index.html')))
  )
})
