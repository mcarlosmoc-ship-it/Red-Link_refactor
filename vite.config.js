import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function bundleAnalyzer() {
  return {
    name: 'bundle-analyzer',
    generateBundle(_, bundle) {
      const report = Object.values(bundle)
        .filter((item) => item.type === 'chunk')
        .map((chunk) => ({
          fileName: chunk.fileName,
          isEntry: chunk.isEntry,
          size: Buffer.byteLength(chunk.code ?? '', 'utf8'),
          imports: chunk.imports,
        }))
        .sort((a, b) => b.size - a.size)

      this.emitFile({
        type: 'asset',
        fileName: 'bundle-report.json',
        source: JSON.stringify(report, null, 2),
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const plugins = [react()]

  if (process.env.ANALYZE === 'true' || mode === 'analyze') {
    plugins.push(bundleAnalyzer())
  }

  return {
    base: './',
    plugins,
    resolve: {
      alias: {
        '@tanstack/react-query': path.resolve(__dirname, 'src/lib/react-query/index.js'),
        '@testing-library/react': path.resolve(__dirname, 'tests/mocks/testing-library-react.js'),
      },
    },
    test: {
      environment: 'node',
      setupFiles: ['tests/setupTests.js'],
    },
  }
})
