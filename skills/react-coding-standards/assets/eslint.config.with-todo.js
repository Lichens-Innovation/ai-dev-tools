/**
 * ESLint flat config — React & TypeScript + TODO ticket reference
 *
 * Extends the base config with a local rule that enforces a ticket reference
 * (e.g. JIRA, Linear) in TODO comments. No extra dependency (uses eslint-rules/todo-ticket-ref.js).
 *
 * 1. Copy eslint.config.js and this file to the project root.
 * 2. Copy the eslint-rules/ folder (todo-ticket-ref.js) to the project root.
 * 3. Use this file as the main config, or merge the block below into your eslint.config.js.
 *
 * Optional: override the pattern for your tool (e.g. pattern: "([A-Z]+-\\d+)" for JIRA).
 */

import baseConfig from "./eslint.config.js";
import todoTicketRef from "./eslint-rules/todo-ticket-ref.js";

export default [
  ...baseConfig,
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    plugins: { "todo-plz": todoTicketRef },
    rules: {
      "todo-plz/ticket-ref": [
        "warn",
        {
          pattern: "([A-Z]+-\\d+)",
          comment: "TODO must include a ticket reference (e.g. TODO: JIRA-1234 - description)",
        },
      ],
    },
  },
  { files: ["eslint-rules/**"], rules: { "todo-plz/ticket-ref": "off" } },
];
