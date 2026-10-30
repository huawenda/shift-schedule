import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

/** 起一个只读静态服务器（端口由系统分配），给产物验收 / 截图脚本托管 dist/ */
export function startStaticServer(rootDir) {
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
    '.txt': 'text/plain; charset=utf-8'
  }

  const server = http.createServer((request, response) => {
    const urlPath = decodeURIComponent((request.url || '/').split('?')[0])
    const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '')
    const filePath = path.join(rootDir, relative)

    if (!filePath.startsWith(rootDir)) {
      response.writeHead(403).end('forbidden')
      return
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(404).end('not found')
        return
      }
      response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' })
      response.end(data)
    })
  })

  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}
