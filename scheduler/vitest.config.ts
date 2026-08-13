import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// 独立配置：不加载 vite.config.ts 中的 vue/tailwind 插件，纯逻辑测试只需要 @ 别名
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
