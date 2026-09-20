import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'

// BASE_PATH is "/backroom/" on the default GitHub Pages URL and "/" behind a custom domain.
// The deploy workflow sets it; local dev always serves from "/".
export default defineConfig({
  plugins: [preact()],
  base: process.env.BASE_PATH || '/',
})
