- [Security coding standards](#security-coding-standards)
  - [*CRITICAL* Avoid Dynamic Code Execution with User Input](#critical-avoid-dynamic-code-execution-with-user-input)
    - [❌ Avoid Passing User Input to `eval` or `new Function`](#-avoid-passing-user-input-to-eval-or-new-function)
    - [✅ Prefer Predefined Logic or Safe Parsers](#-prefer-predefined-logic-or-safe-parsers)
    - [ℹ️ Explanation](#ℹ️-explanation)
  - [*CRITICAL* Avoid Unsanitised HTML Injection (XSS)](#critical-avoid-unsanitised-html-injection-xss)
    - [❌ Avoid Assigning User Input to `innerHTML` or `dangerouslySetInnerHTML`](#-avoid-assigning-user-input-to-innerhtml-or-dangerouslysetinnerhtml)
    - [✅ Prefer `textContent` or Sanitised HTML](#-prefer-textcontent-or-sanitised-html)
    - [ℹ️ Explanation](#ℹ️-explanation-1)
    - [📚 References](#-references)
  - [*CRITICAL* Avoid String Concatenation in Database Queries (SQL/NoSQL Injection)](#critical-avoid-string-concatenation-in-database-queries-sqlnosql-injection)
    - [❌ Avoid Building Queries with String Interpolation](#-avoid-building-queries-with-string-interpolation)
    - [✅ Prefer Parameterised Queries or an ORM](#-prefer-parameterised-queries-or-an-orm)
    - [ℹ️ Explanation](#ℹ️-explanation-2)
  - [*CRITICAL* Avoid Unvalidated User Input in File Paths (Path Traversal)](#critical-avoid-unvalidated-user-input-in-file-paths-path-traversal)
    - [❌ Avoid Using User Input Directly in `path.join` or `fs` Calls](#-avoid-using-user-input-directly-in-pathjoin-or-fs-calls)
    - [✅ Prefer `path.resolve` with Prefix Validation](#-prefer-pathresolve-with-prefix-validation)
    - [ℹ️ Explanation](#ℹ️-explanation-3)
  - [*CRITICAL* Avoid Hardcoded Secrets in Source Code](#critical-avoid-hardcoded-secrets-in-source-code)
    - [❌ Avoid Inlining API Keys, Tokens, or Passwords](#-avoid-inlining-api-keys-tokens-or-passwords)
    - [✅ Prefer Environment Variables with Startup Validation](#-prefer-environment-variables-with-startup-validation)
    - [ℹ️ Explanation](#ℹ️-explanation-4)
  - [*CRITICAL* Avoid Merging Untrusted Objects Without Validation (Prototype Pollution)](#critical-avoid-merging-untrusted-objects-without-validation-prototype-pollution)
    - [❌ Avoid `Object.assign` or Spread with Untrusted Data](#-avoid-objectassign-or-spread-with-untrusted-data)
    - [✅ Prefer Schema Validation Before Merging](#-prefer-schema-validation-before-merging)
    - [ℹ️ Explanation](#ℹ️-explanation-5)
  - [*CRITICAL* Avoid Passing User Input Directly to `child_process`](#critical-avoid-passing-user-input-directly-to-child_process)
    - [❌ Avoid Shell Interpolation with User-Controlled Values](#-avoid-shell-interpolation-with-user-controlled-values)
    - [✅ Prefer Allowlist Validation and `execFile` with an Argument Array](#-prefer-allowlist-validation-and-execfile-with-an-argument-array)
    - [ℹ️ Explanation](#ℹ️-explanation-6)
    - [📚 References](#-references-1)

# Security coding standards

This section lists security patterns for TypeScript and React projects. All items are **CRITICAL** — they represent exploitable vulnerabilities, not style preferences.

## *CRITICAL* Avoid Dynamic Code Execution with User Input

### ❌ Avoid Passing User Input to `eval` or `new Function`

```typescript
// eval executes arbitrary code — attacker controls the string
function calculate(expression: string): number {
  return eval(expression); // ❌ remote code execution
}

// new Function is equally dangerous
const fn = new Function("return " + userInput); // ❌
fn();
```

### ✅ Prefer Predefined Logic or Safe Parsers

```typescript
// For JSON payloads, use JSON.parse (still wrap in try/catch)
function parseConfig(raw: string): Config {
  return configSchema.parse(JSON.parse(raw)); // safe + validated
}

// For math expressions, use a dedicated safe-eval library or a lookup map
const OPERATIONS: Record<string, (a: number, b: number) => number> = {
  add: (a, b) => a + b,
  subtract: (a, b) => a - b,
};

function calculate(op: string, a: number, b: number): number {
  const fn = OPERATIONS[op];
  if (!fn) throw new Error(`Unknown operation: ${op}`);
  return fn(a, b);
}
```

### ℹ️ Explanation

- **Remote code execution:** Any string passed to `eval` or `new Function` runs with full application privileges. An attacker who controls that string can exfiltrate secrets, modify state, or pivot further.
- **No safe subset:** There is no reliable way to sanitise an expression before passing it to `eval`. Allowlisting the input is error-prone and routinely bypassed.
- **Safe alternatives exist:** JSON deserialisation (`JSON.parse`), lookup maps, or dedicated expression-parser libraries (e.g. `expr-eval`) cover virtually every legitimate use case without execution risk.

---

## *CRITICAL* Avoid Unsanitised HTML Injection (XSS)

### ❌ Avoid Assigning User Input to `innerHTML` or `dangerouslySetInnerHTML`

```typescript
// DOM assignment — injects and executes arbitrary HTML
element.innerHTML = userComment; // ❌

// React equivalent — equally unsafe with raw user data
function Comment({ body }: { body: string }) {
  return <div dangerouslySetInnerHTML={{ __html: body }} />; // ❌
}

// document.write is retired but still dangerous
document.write(userInput); // ❌
```

### ✅ Prefer `textContent` or Sanitised HTML

```typescript
// Use textContent when you only need to display text
element.textContent = userComment; // safe — no HTML parsing

// When rich HTML is genuinely needed, sanitise first with DOMPurify
import DOMPurify from "dompurify";

function Comment({ body }: { body: string }) {
  const clean = DOMPurify.sanitize(body);
  return <div dangerouslySetInnerHTML={{ __html: clean }} />;
}
```

### ℹ️ Explanation

- **XSS via injection:** Assigning unsanitised HTML allows attackers to inject `<script>` tags or event handlers that run in the user's browser, stealing session tokens or performing actions on their behalf.
- **`dangerouslySetInnerHTML` is intentionally named:** React flags this prop to signal that the caller is responsible for sanitisation — it is not a safe escape hatch on its own.
- **DOMPurify:** A widely-used, actively maintained library that strips dangerous tags and attributes while preserving safe markup. It is the standard solution when HTML rendering is unavoidable.

### 📚 References

- [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [DOMPurify](https://github.com/cure53/DOMPurify)

---

## *CRITICAL* Avoid String Concatenation in Database Queries (SQL/NoSQL Injection)

### ❌ Avoid Building Queries with String Interpolation

```typescript
// SQL injection — attacker sets userId to "1 OR 1=1"
async function getUser(userId: string) {
  const result = await db.query(
    `SELECT * FROM users WHERE id = ${userId}` // ❌
  );
  return result.rows[0];
}

// NoSQL injection — attacker sends { $gt: "" } as username
async function findUser(username: string) {
  return collection.findOne({ username: username }); // ❌ if username is unvalidated external input
}
```

### ✅ Prefer Parameterised Queries or an ORM

```typescript
// Parameterised query — driver escapes the value
async function getUser(userId: string) {
  const result = await db.query(
    "SELECT * FROM users WHERE id = $1",
    [userId] // safe
  );
  return result.rows[0];
}

// ORM (e.g. Prisma) — parameterisation is automatic
async function getUser(userId: string) {
  return prisma.user.findUnique({ where: { id: userId } });
}

// NoSQL — validate the shape with zod before querying
const usernameSchema = z.string().min(1).max(100).regex(/^[\w.-]+$/);

async function findUser(rawUsername: unknown) {
  const username = usernameSchema.parse(rawUsername);
  return collection.findOne({ username });
}
```

### ℹ️ Explanation

- **Injection root cause:** Concatenating user input into a query string allows the input to change the query's *structure*, not just its *values*. A parameterised query enforces this separation at the driver level.
- **NoSQL is not immune:** MongoDB operators like `$where`, `$gt`, or `$regex` can be injected via unvalidated objects. Schema validation at the boundary neutralises this.
- **ORMs as a default:** Modern ORMs (Prisma, TypeORM, Drizzle) use parameterised statements internally and are the safest default for application code.

---

## *CRITICAL* Avoid Unvalidated User Input in File Paths (Path Traversal)

### ❌ Avoid Using User Input Directly in `path.join` or `fs` Calls

```typescript
import fs from "fs/promises";
import path from "path";

const BASE_DIR = "/app/uploads";

// Attacker passes "../../etc/passwd" — reads outside the intended directory
async function readFile(filename: string) {
  const filePath = path.join(BASE_DIR, filename); // ❌
  return fs.readFile(filePath, "utf8");
}
```

### ✅ Prefer `path.resolve` with Prefix Validation

```typescript
import fs from "fs/promises";
import path from "path";

const BASE_DIR = path.resolve("/app/uploads");

async function readFile(filename: string) {
  const resolved = path.resolve(BASE_DIR, filename);

  if (!resolved.startsWith(BASE_DIR + path.sep)) {
    throw new Error("Access denied: path traversal detected");
  }

  return fs.readFile(resolved, "utf8");
}
```

### ℹ️ Explanation

- **`path.join` does not prevent traversal:** `path.join("/app/uploads", "../../etc/passwd")` resolves to `/etc/passwd`. Joining paths is not a security boundary.
- **`path.resolve` + prefix check:** `path.resolve` canonicalises the path (collapses `..` segments), so a prefix comparison accurately determines whether the result is inside the allowed directory.
- **Add a `path.sep` suffix to the base:** Checking `startsWith(BASE_DIR)` alone allows `/app/uploads-extra/…` to pass. Appending `path.sep` ensures only paths *inside* the directory are accepted.

---

## *CRITICAL* Avoid Hardcoded Secrets in Source Code

### ❌ Avoid Inlining API Keys, Tokens, or Passwords

```typescript
// Committed to git — now in history forever
const API_KEY = "sk-live-abc123xyz"; // ❌
const DB_PASSWORD = "hunter2"; // ❌

const client = new SomeClient({ apiKey: API_KEY });
```

### ✅ Prefer Environment Variables with Startup Validation

```typescript
import { z } from "zod";

const envSchema = z.object({
  API_KEY: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DATABASE_URL: z.string().url(),
});

// Validate once at startup — crashes fast if config is missing
const env = envSchema.parse(process.env);

const client = new SomeClient({ apiKey: env.API_KEY });
```

### ℹ️ Explanation

- **Git history is permanent:** A secret committed to a repository persists in history even after removal. Assume any leaked secret is compromised and must be rotated immediately.
- **Environment variables are the standard:** The [12-factor app](https://12factor.net/config) pattern externalises configuration so the same build runs in any environment without embedding credentials.
- **Fail fast at startup:** Validating `process.env` with zod (or a similar schema library) at application startup prevents subtle runtime failures caused by missing or misconfigured environment variables.

---

## *CRITICAL* Avoid Merging Untrusted Objects Without Validation (Prototype Pollution)

### ❌ Avoid `Object.assign` or Spread with Untrusted Data

```typescript
// Attacker sends { "__proto__": { "isAdmin": true } }
async function updateSettings(userId: string, patch: object) {
  Object.assign(userSettings[userId], patch); // ❌ pollutes Object.prototype
}

// Spread has the same issue
const config = { ...defaults, ...untrustedPayload }; // ❌
```

### ✅ Prefer Schema Validation Before Merging

```typescript
import { z } from "zod";

const settingsPatchSchema = z.object({
  theme: z.enum(["light", "dark"]).optional(),
  language: z.string().max(10).optional(),
});

async function updateSettings(userId: string, rawPatch: unknown) {
  const patch = settingsPatchSchema.parse(rawPatch); // strips unknown keys
  Object.assign(userSettings[userId], patch); // safe — shape is known
}

// When a truly key-value store is needed, use a null-prototype object
const store = Object.create(null) as Record<string, string>;
```

### ℹ️ Explanation

- **Prototype pollution:** Merging an object containing `__proto__` or `constructor` keys modifies `Object.prototype`, affecting every subsequent object in the process and enabling privilege escalation.
- **Schema validation strips unknown keys:** Zod's `parse` (and similar validators) only pass through fields declared in the schema, so attacker-controlled keys like `__proto__` are silently dropped.
- **`Object.create(null)`:** Creates an object with no prototype chain at all, making `__proto__` injection structurally impossible for plain key-value stores.

---

## *CRITICAL* Avoid Passing User Input Directly to `child_process`

### ❌ Avoid Shell Interpolation with User-Controlled Values

```typescript
import { exec, spawn } from "child_process";

// Attacker passes ".; rm -rf /" as filename
function convertFile(filename: string) {
  exec(`convert ${filename} output.png`); // ❌ shell injection
}

// spawn with shell: true is equally unsafe
spawn("sh", ["-c", `ls ${userInput}`], { shell: true }); // ❌
```

### ✅ Prefer Allowlist Validation and `execFile` with an Argument Array

```typescript
import { execFile } from "child_process";
import path from "path";

const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".webp"]);

async function convertFile(filename: string): Promise<void> {
  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported file type: ${ext}`);
  }

  // execFile does not invoke a shell — arguments are passed directly to the binary
  await new Promise<void>((resolve, reject) => {
    execFile("convert", [filename, "output.png"], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
```

### ℹ️ Explanation

- **Shell injection root cause:** `exec` and `spawn({ shell: true })` pass the command string to `/bin/sh -c`, which interprets shell metacharacters (`;`, `|`, `$()`, etc.). User input embedded in the string can inject additional commands.
- **`execFile` does not use a shell:** Arguments are passed directly to the target executable as an array. Shell metacharacters in the arguments are treated as literal strings, not syntax.
- **Allowlisting:** Validating that the input matches an expected set of values (extension, command name, etc.) provides a second layer of defence independent of how the process is spawned.

### 📚 References

- [OWASP Command Injection](https://owasp.org/www-community/attacks/Command_Injection)
- [Node.js `child_process` docs — `execFile`](https://nodejs.org/api/child_process.html#child_processexecfilefile-args-options-callback)
