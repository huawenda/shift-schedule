import { isH5Runtime } from './runtime'

const pwaThemeColor = '#eef4fb'

function upsertLink(rel: string, href: string) {
  const existing = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (existing) {
    existing.href = href
    return
  }

  const link = document.createElement('link')
  link.rel = rel
  link.href = href
  document.head.appendChild(link)
}

function upsertMeta(name: string, content: string) {
  const existing = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (existing) {
    existing.content = content
    return
  }

  const meta = document.createElement('meta')
  meta.name = name
  meta.content = content
  document.head.appendChild(meta)
}

export function setupPwa() {
  if (!isH5Runtime || typeof document === 'undefined') return

  document.title = '倒班表'
  upsertLink('manifest', '/manifest.webmanifest')
  upsertLink('apple-touch-icon', '/icons/icon-192.png')
  upsertMeta('theme-color', pwaThemeColor)
  upsertMeta('msapplication-navbutton-color', pwaThemeColor)
  upsertMeta('mobile-web-app-capable', 'yes')
  upsertMeta('apple-mobile-web-app-capable', 'yes')
  upsertMeta('apple-mobile-web-app-title', '倒班表')
  upsertMeta('apple-mobile-web-app-status-bar-style', 'black-translucent')

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js').catch(error => {
        console.warn('PWA service worker registration failed', error)
      })
    })
  }
}
