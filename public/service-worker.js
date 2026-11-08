// 本地版的 Service Worker：只为了让「安装到桌面 / 主屏幕」可用。
// 资源全部是本地静态文件，本来就不需要网络，所以这里只做运行期缓存 + 离线兜底。
// 注意：file:// 下浏览器不允许注册 SW，main.tsx 里已按协议跳过。

// __BUILD_ID__ 由 vite.config.ts 的 serviceWorkerBuildIdPlugin 在构建时替换成
// 时间戳。名字里带上它，activate 里的「清掉所有非当前缓存」才真的能触发；
// 写死版本号的话清理形同虚设，旧 hash 资源会无限堆积。
const CACHE_NAME = 'shift-schedule-local-__BUILD_ID__'
const SHELL_URL = './index.html'

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting())
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
  const request = event.request
  if (request.method !== 'GET') return

  const requestUrl = new URL(request.url)
  if (requestUrl.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          cacheResponse(SHELL_URL, response.clone())
          return response
        })
        .catch(() => caches.match(SHELL_URL))
    )
    return
  }

  /* manifest 必须走**网络优先**，不能缓存优先：
   * 里面的 theme_color / background_color 决定 PWA 的状态栏色与系统导航栏
   * 上边界那条分隔线。缓存优先会让改过的 manifest 永远发不出去 ——
   * 页面看着是新的（meta 是实时加载的），系统栏却还是旧值，
   * 于是「顶部已经变白、底部还留一道旧色线」这种半新半旧的状态。
   *
   * manifest 本身也不该进缓存：它是安装期元数据，缓存它没有离线收益。 */
  if (request.destination === 'manifest' || requestUrl.pathname.endsWith('.webmanifest')) {
    event.respondWith(fetch(request))
    return
  }

  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) return cachedResponse

      return fetch(request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          cacheResponse(request, response.clone())
        }
        return response
      })
    })
  )
})

function cacheResponse(key, response) {
  caches.open(CACHE_NAME).then(cache => cache.put(key, response))
}
