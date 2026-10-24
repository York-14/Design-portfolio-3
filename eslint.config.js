import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { globals: globals.browser },
    rules: {
      // Determinism is the core contract of this project: no hidden randomness.
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the golden-angle seed protocol.' },
      ],
    },
  },
  {
    files: ['scripts/**/*.{js,cjs,mjs}', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
