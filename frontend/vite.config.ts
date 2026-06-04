import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function moveCssBeforeModuleScript() {
  return {
    name: 'yourtj-move-css-before-module-script',
    enforce: 'post',
    transformIndexHtml(html: string) {
      // Avoid CLS caused by module script executing before the extracted CSS link is discovered.
      const cssLinkRe = /(<link\s+rel="stylesheet"[^>]*>)/
      const scriptRe = /(<script\s+type="module"[^>]*><\/script>)/
      const css = html.match(cssLinkRe)?.[1]
      const script = html.match(scriptRe)?.[1]
      if (!css || !script) return html

      return html.replace(cssLinkRe, '').replace(scriptRe, `${css}\n    ${script}`)
    }
  } as any
}

export default defineConfig({
  plugins: [moveCssBeforeModuleScript(), react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true
      }
    }
  }
})
