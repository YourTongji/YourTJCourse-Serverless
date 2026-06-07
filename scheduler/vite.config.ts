import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

function moveCssBeforeModuleScript() {
  return {
    name: 'yourtj-move-css-before-module-script',
    enforce: 'post',
    transformIndexHtml(html: string) {
      // Avoid CLS caused by module script executing before the extracted CSS link is discovered.
      const cssLinkRe = /(<link\s+rel=\"stylesheet\"[^>]*>)/
      const scriptRe = /(<script\s+type=\"module\"[^>]*><\/script>)/
      const css = html.match(cssLinkRe)?.[1]
      const script = html.match(scriptRe)?.[1]
      if (!css || !script) return html

      return html.replace(cssLinkRe, '').replace(scriptRe, `${css}\n    ${script}`)
    },
  } as any
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: '/sim/',
  plugins: [
    moveCssBeforeModuleScript(),
    vue(),
    command === 'serve' ? vueDevTools() : undefined,
    tailwindcss(),
  ].filter(Boolean) as any,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'https://jcourse.yourtj.de',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  build: {
    outDir: '../frontend/public/sim',
    emptyOutDir: true,
  }
}))
