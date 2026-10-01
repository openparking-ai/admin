import globals from 'globals';
import readableText from './scripts/eslint-readable-text.js';

const base = {
  'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  'no-undef': 'error',
  eqeqeq: ['error', 'always'],
  'prefer-const': 'error',
};

export default [
  { ignores: ['dist/', 'node_modules/', 'test-results/'] },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: base,
  },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { local: readableText },
    rules: {
      ...base,
      'local/jsx-uses-vars': 'error',
      'local/no-readable-literal': 'error',
    },
  },
];
