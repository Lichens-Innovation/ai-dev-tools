# Design plugin: anonymise dev data in local-backend screen captures

Implement the following vertical slice. When complete, ensure every acceptance
criterion below is met.

## What to build

On the local design backend, `capture.mjs screen` snapshots the running app into `design/screens/`, which is committed, so whatever real dev data the screen shows ends up in git. Today it only prints a warning. Make the capture anonymise the data itself, in three layers, all inside the screen capture (components captured from Storybook are unchanged):

1. **Rewrite the app's JSON before it renders.** While capturing, intercept the app's JSON responses with Playwright's `page.route` and replace personal string fields, matched by key name (case-insensitive: name, firstName, lastName, fullName, email, phone, address, street, city, zip/postalCode, company, username, avatar URLs, and similar), with fake values from `@faker-js/faker`. Faker is resolved from the working directory like Playwright already is; when it's missing, the capture stops with a message that names the install command. Design-init's local setup installs it as a dev dependency next to Playwright. Fakes are deterministic: seed from a hash of the original value, so the same real value always maps to the same fake (a name in a list and in a header still match) and re-capturing an unchanged screen gives the same file. Keep each value's type and roughly its length, so the layout stays real.
2. **Redact server-rendered data by selector.** Data rendered into the HTML on the server (SSR first load, e.g. TanStack Start) never goes through a JSON response. A screen row may carry `anonymize.redact: ["<css selector>", …]`. Before saving, the text of every matching element is replaced with a fake of the same kind and roughly the same length (email-looking text becomes a fake email, and so on).
3. **Final check.** Scan the snapshot's text and attributes for what still looks personal: email addresses, phone numbers, and token-like strings (JWTs, long hex or base64 secrets, `Bearer …`). Any match the anonymiser didn't produce fails the capture with a dedicated exit code, writes nothing, and lists each match with the element it was found in, so the user can add a selector or key. `anonymize.allow: ["…"]` lists literal values that are fine (a support address in the footer).

The screen row's `anonymize` object is optional: `{ keys?: string[] (extra JSON keys to fake), redact?: string[], allow?: string[] }`. Document it in the design contract (the local backend's screen rows) and in local-studio.md's sample-data section. Replace the current warning there and in design-refresh's local add-screen step with what the capture now does and what it can't know (data shown from non-JSON sources it can't see, e.g. images of people). Bump the design plugin's patch version.

## Acceptance criteria

- [ ] A screen captured from a fixture app whose JSON API returns names, emails and phones contains only fake values, and capturing it twice gives byte-identical reference files
- [ ] The same real value maps to the same fake value everywhere in a snapshot
- [ ] Text in elements matching a screen's `anonymize.redact` selectors is replaced; text outside them is untouched (UI labels survive)
- [ ] A snapshot that still contains an email, phone number or token-like string not listed in `anonymize.allow` fails with a dedicated exit code, writes no files, and names each match and its element
- [ ] Component captures from Storybook behave as before
- [ ] Without @faker-js/faker installed, a screen capture stops with a message naming the install command; design-init's local setup installs it
- [ ] test-capture.sh covers JSON interception, determinism, redact selectors, the final check and allow, and passes with `bash`; the existing design plugin tests still pass
- [ ] The design contract, local-studio.md, design-refresh and the plugin README describe `anonymize`, and the plugin version is bumped

## Blocked by

None — can start immediately
