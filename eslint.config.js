import pluginJs from "@eslint/js"
import prettierConfig from "eslint-config-prettier/flat"
import importPlugin from "eslint-plugin-import"
import pluginReact from "eslint-plugin-react"
import reactHooks from "eslint-plugin-react-hooks"
import globals from "globals"

/** @type {import('eslint').Linter.Config[]} */
export default [
  { files: ["app/javascript/**/*.{js,mjs,cjs,jsx}"] },
  { ignores: ["app/javascript/components/ui/**", "app/javascript/routes/**"] },
  {
    settings: {
      react: {
        version: "detect",
      },
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  pluginJs.configs.recommended,
  reactHooks.configs.flat.recommended,
  pluginReact.configs.flat.recommended,
  pluginReact.configs.flat["jsx-runtime"],
  prettierConfig,
  {
    ...importPlugin.flatConfigs.recommended,
    ...importPlugin.flatConfigs.react,
    rules: {
      "react/prop-types": "off",
      "import/order": [
        "error",
        {
          "newlines-between": "always",
          named: true,
          alphabetize: { order: "asc" },
        },
      ],
      "import/first": "error",
      "react/prop-types": "off",
    },
  },
]
