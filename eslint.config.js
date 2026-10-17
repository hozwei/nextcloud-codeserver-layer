// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';

const typescriptRules = {
  // TypeScript checks these itself; the core rules do not understand type positions.
  'no-undef': 'off',
  'no-unused-vars': 'off',
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  // A forgotten await is the most common cause of flaky browser tests, and of lost errors.
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': 'error',
};

export default [
  {
    ignores: ['node_modules/', 'test-results/', 'playwright-report/', 'blob-report/', '.codeserver/',
      'codeserver_layer/js/', 'codeserver_layer/l10n/', 'codeserver_layer/vendor/', 'codeserver_layer/build/'],
  },
  js.configs.recommended,
  {
    files: ['**/*.mjs', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node } },
  },
  {
    // The Nextcloud app's front end (bundled by esbuild to codeserver_layer/js/, see its build.mjs).
    files: ['codeserver_layer/src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: './codeserver_layer/tsconfig.json', tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: typescriptRules,
  },
  {
    files: ['tests/unit/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: './tests/tsconfig.json', tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.node },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      ...typescriptRules,
      // node:test runs the tests a file declares; their promises are its to await.
      '@typescript-eslint/no-floating-promises': ['error', { allowForKnownSafeCalls: [{ from: 'package', name: 'test', package: 'node:test' }] }],
    },
  },
  {
    files: ['tests/e2e/**/*.ts'],
    ...playwright.configs['flat/recommended'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: './tests/tsconfig.json', tsconfigRootDir: import.meta.dirname },
      // Callbacks passed to page.evaluate() run in the browser.
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { '@typescript-eslint': tseslint.plugin, ...playwright.configs['flat/recommended'].plugins },
    rules: { ...playwright.configs['flat/recommended'].rules, ...typescriptRules },
  },
];
