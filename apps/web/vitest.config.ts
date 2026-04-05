import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    alias: {
      '@/': new URL('./src/', import.meta.url).pathname,
    },
  },
})
