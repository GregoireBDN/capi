import { defineConfig } from '@hey-api/openapi-ts'

// Types only: the MCP server has its own small fetch client (api/client.ts)
// that adds the bearer token and maps API errors to readable messages.
export default defineConfig({
  input: '../api/openapi.json',
  output: {
    path: 'src/api/generated',
    postProcess: ['prettier'],
    module: { extension: '.js' },
  },
  plugins: ['@hey-api/typescript'],
})
