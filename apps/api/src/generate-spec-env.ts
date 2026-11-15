/**
 * The OpenAPI document describes every route, including the remote MCP OAuth
 * routes (#78) that are only mounted when `REMOTE_MCP_ENABLED=true`: the web
 * client needs their types even while the feature is off. Imported after
 * `load-env` and before anything reads `env`. Never affects a running server.
 */
process.env['REMOTE_MCP_ENABLED'] = 'true'
