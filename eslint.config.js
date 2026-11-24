// ESLint flat config (D-03): catch real problems (undefined names, typos, unreachable code), not style.
// The compact one-line style of the codebase is intentional.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'dist/**', 'assets/**', 'docs/**', 'test-results/**', 'src/data_*.js'] },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser } },
    linterOptions: { reportUnusedDisableDirectives: 'warn' },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-constant-condition': ['warn', { checkLoops: false }],
    },
  },
  { files: ['tests/**', 'tools/**'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
];
