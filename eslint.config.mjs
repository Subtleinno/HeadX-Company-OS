import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/.workbuddy/**', '**/.zcode/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-undef': 'off',
    },
  },
  {
    files: [
      'apps/platform/**/*.ts',
      'scripts/**/*.ts',
      'scripts/**/*.mjs',
      'tools/**/*.ts',
      'tools/**/*.mjs',
      '*.mjs',
      '*.ts',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['apps/web/**/*.ts', 'apps/web/**/*.tsx'],
    languageOptions: {
      globals: globals.browser,
    },
  },
);
