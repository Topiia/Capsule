module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react/jsx-runtime",
    "plugin:react-hooks/recommended",
  ],
  ignorePatterns: ["dist", ".eslintrc.cjs", "postcss.config.js"],
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  settings: { react: { version: "18.2" } },
  plugins: ["react-refresh"],
  rules: {
    "linebreak-style": "off",
    "react-refresh/only-export-components": [
      "warn",
      { allowConstantExport: true },
    ],
    "react/prop-types": "off",
    "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  },
  overrides: [
    {
      // Test files — enable jest + node globals, relax test-specific rules
      files: [
        "**/*.test.jsx",
        "**/*.test.js",
        "**/__tests__/**/*.jsx",
        "**/__tests__/**/*.js",
        "**/tests/**/*.jsx",
        "**/tests/**/*.js",
      ],
      env: {
        jest: true,
        node: true,
        browser: true,
      },
      rules: {
        // Test wrapper components are anonymous by convention
        "react/display-name": "off",
        // Jest globals (global.fetch, global.ResizeObserver, etc.)
        "no-undef": "off",
        // Tests commonly import helpers without using every export
        "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
        // Fast-refresh rule is irrelevant for test files
        "react-refresh/only-export-components": "off",
      },
    },
  ],
};
