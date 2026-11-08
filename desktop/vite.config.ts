import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** 源码根目录在 desktop/ 上一级：两条产物线共用同一份 src/。 */
const appRoot = path.resolve(__dirname, '..')

/**
 * 把 Service Worker 和 webmanifest 从壳的产物里摘掉。
 *
 * public/ 是和静态版共用的，里面有 service-worker.js；直接共用会把
 * 它一起拷进 dist-taauri。壳里留着它是有害的（缓存优先会挡住新版本），
 * 所以构建后删掉，顺手把 index.html 里的 manifest 引用也去掉 ——
 * PWA 那套是给「装到桌面」用的，壳本身就是桌面程序。
 */
function stripPwaAssetsPlugin(): Plugin {
  return {
    name: 'shift-schedule-local:desktop-strip-pwa',
    apply: 'build',
    enforce: 'post',
    writeBundle(options) {
      const outDir = options.dir ?? path.resolve(appRoot, 'dist-tauri')

      for (const file of ['service-worker.js', 'manifest.webmanifest']) {
        const target = path.join(outDir, file)
        if (fs.existsSync(target)) fs.unlinkSync(target)
      }

      const indexPath = path.join(outDir, 'index.html')
      if (!fs.existsSync(indexPath)) return

      const html = fs.readFileSync(indexPath, 'utf8')
      const patched = html
        .replace(/\s*<link\s+rel="manifest"[^>]*>/, '')
        .replace(/\s*<link\s+rel="apple-touch-icon"[^>]*>/, '')
        // 主程序不需要被「添加到主屏幕」，这两行留着只会误导。
        .replace(/\s*<meta\s+name="apple-mobile-web-app-[^>]*>/g, '')

      if (patched !== html) fs.writeFileSync(indexPath, patched, 'utf8')
    }
  }
}

/**
 * Tauri 产物线的构建配置。
 *
 * 与静态版（../vite.config.ts）共用同一份 src/，但有三处不同，
 * 都是为了适配「装成本地程序」而不是「拷一个文件夹到处跑」：
 *
 * 1. 输出到 ../dist-tauri —— 不碰 ../dist。静态版的 dist 还要打成 zip
 *    分发给同事，两条产物线必须互不覆盖，否则其中一条会把另一条弄脏。
 *
 * 2. 不再注册 Service Worker。静态版的 SW 是给「添加到主屏幕」用的缓存层，
 *    而壳里的资源由 Tauri 随程序一起安装、更新时整体替换。
 *    留着它反而有害：SW 对同源 GET 是缓存优先，换了新版本之后
 *    打开仍会命中上一版的缓存，界面停在旧代码上。
 *    （main.tsx 里已按 `__TAURI_INTERNALS__` 判定壳内并跳过注册，
 *      这里从构建侧再堵一道：直接不产出 service-worker.js。）
 *
 * 3. 不套 fileProtocolFriendlyPlugin。那个插件把 <script type=module>
 *    改写成 <script defer>，是为了让产物能被 file:// 直接打开；
 *    壳里走的是自定义协议或 http://tauri.localhost，模块脚本正常工作，
 *    强行降级成 defer 反而丢掉了模块的语义。
 *
 * base 仍为 './'：Tauri 注入资源时用的是相对路径，保持一致最省事。
 */
export default defineConfig({
  // root 指向仓库根（而不是 desktop/）：index.html 与 src/ 都在那里，
  // 壳与静态版共用同一份入口。
  root: appRoot,
  base: './',
  // public/ 也要显式指过去，否则 vite 会去 desktop/public 找，图标和说明就丢了。
  publicDir: path.resolve(appRoot, 'public'),
  // 与根配置保持一致：两条产物线共用同一份 src/，缺任一插件/别名都会构建失败
  plugins: [tailwindcss(), stripPwaAssetsPlugin()],

  resolve: {
    alias: {
      '@': path.resolve(appRoot, 'src')
    }
  },

  server: {
    // 与静态版 dev 端口错开：两个 dev server 同时开会互相抢占。
    // 必须显式绑 127.0.0.1：默认的 localhost 在 Windows 上可能只解到 ::1，
    // 而 tauri.conf.json 的 devUrl 写的是 http://127.0.0.1:6182，
    // 结果就是 tauri 一直打印 "Waiting for your frontend dev server to start"。
    host: '127.0.0.1',
    port: 6182,
    strictPort: true,
    watch: {
      ignored: ['**/dist/**', '**/dist-tauri/**', '**/screenshots/**', '**/*.zip']
    }
  },

  // 壳的 dev 模式（tauri dev）指向这个地址。
  // 注意必须带 /index.html：base 是 './'，裸路径 / 会 404。
  preview: {
    port: 6183,
    strictPort: true
  },

  build: {
    outDir: path.resolve(appRoot, 'dist-tauri'),
    emptyOutDir: true,
    target: 'es2021',
    cssCodeSplit: false,
    // 壳里没有 file:// 的限制，小资源走相对路径即可；
    // 静态版为了 file:// 把图标全内联成 base64（assetsInlineLimit 拉满），
    // 这里只留一个小阈值，避免为了几个字节多出请求，也不至于把产物撑大。
    assetsInlineLimit: 4096,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'assets/app-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
})
