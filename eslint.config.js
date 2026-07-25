import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser
    },
    rules: {
      // `const { id: _, ...rest } = row` is how the store strips a field
      // before an update() call — `_` is the established "discarded" name.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['vite.config.ts', 'playwright.config.ts', 'e2e/**/*.ts'],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    // Standard shadcn-style (component + variants/constant) and
    // context-provider (component + hook) exports. Splitting these into
    // separate files would only satisfy Fast Refresh's dev-only HMR
    // optimization — no production/correctness benefit — at the cost of
    // rippling through every import site.
    files: ['src/components/ui/**/*.tsx', 'src/auth/AuthProvider.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off'
    }
  }
)
