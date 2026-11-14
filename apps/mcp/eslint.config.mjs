// @ts-check
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'src/api/generated', 'eslint.config.mjs'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // stdout is the MCP channel: anything printed there corrupts the protocol.
      'no-console': ['error', { allow: ['error'] }],
    },
  },
)
