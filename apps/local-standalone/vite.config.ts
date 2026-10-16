import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const coreEntry = path.resolve(__dirname, 'src/core/index.ts')

/**
 * 让 dist 目录既能被静态服务器托管，也能直接双击 index.html（file://）打开：
 *
 * 1. `format: 'iife'` + `inlineDynamicImports`: 产出单个普通脚本，避免 file:// 下
 *    ES module 被 CORS 拦截；
 * 2. `assetsInlineLimit` 拉满: JS/CSS 里引用的资源全部内联成 data URI，避免相对路径解析；
 * 3. 构建后把 `<script type="module" crossorigin src=...>` 改写成 `<script defer src=...>`，
 *    去掉 file:// 下同样会被拦截的 crossorigin 模块加载。
 */
function fileProtocolFriendlyPlugin(): Plugin {
  return {
    name: 'shift-schedule-local:file-protocol-friendly',
    apply: 'build',
    enforce: 'post',
    writeBundle(options) {
      const outDir = options.dir ?? path.resolve(__dirname, 'dist')
      const indexPath = path.join(outDir, 'index.html')
      if (!fs.existsSync(indexPath)) return

      const html = fs.readFileSync(indexPath, 'utf8')
      const patched = html
        .replace(/<script\s+type="module"\s+crossorigin\s+src=/g, '<script defer src=')
        .replace(/<script\s+type="module"\s+src=/g, '<script defer src=')
        .replace(/<link\s+rel="modulepreload"[^>]*>\s*/g, '')

      if (patched !== html) fs.writeFileSync(indexPath, patched, 'utf8')
    }
  }
}

export default defineConfig({
  // 相对路径：dist 放到任意目录、任意子路径下都能用
  base: './',
  resolve: {
    alias: {
      '@local/core': coreEntry
    }
  },
  plugins: [fileProtocolFriendlyPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2019',
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 2048,
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
