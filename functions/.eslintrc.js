module.exports = {
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    "ecmaVersion": 2018,
  },
  extends: [
    "eslint:recommended",
    "google",
  ],
  rules: {
    "no-restricted-globals": ["error", "name", "length"],
    "prefer-arrow-callback": "error",
    "quotes": ["error", "double", {"allowTemplateLiterals": true}],
    "no-prototype-builtins": "off",
    "require-jsdoc": "off",
    "valid-jsdoc": "off",
    "max-len": ["warn", { "code": 120 }],
    "no-undef": "off",
    "no-unused-vars": "off",
  },
  overrides: [
    {
      files: ["**/*.spec.*"],
      env: {
        mocha: true,
      },
      rules: {},
    },
  ],
  globals: {
    "require": "readonly",
    "module": "readonly",
    "exports": "writable"
  },
};
