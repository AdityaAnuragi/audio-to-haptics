import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
  publicDir: false,
  build: {
    outDir: 'lib',
    emptyOutDir: true,
    lib: {
      entry: {
        index: 'src/index.ts',
        react: 'src/react.ts',
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    },
  },
})
