import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@testing-library/react': path.resolve(__dirname, 'tests/mocks/testing-library-react.js'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['tests/setupTests.js'],
  },
})
