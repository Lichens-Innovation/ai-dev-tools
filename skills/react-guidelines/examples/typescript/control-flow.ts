/**
 * CONTROL FLOW & READABILITY — TypeScript / JavaScript
 * Rules:
 * - Prefer early returns over nested if-else (max 4 levels).
 * - Prefer const over let; use reduce / pure functions instead of mutable accumulators.
 * - Use Array.includes() for multiple value checks; use Array.some() for existence checks.
 * - Prefer ?? over || for null/undefined (see type-safety.ts for details).
 * - Extract complex expressions into variables (destructuring, intermediate vars) for clarity.
 */
export {};

// ─────────────────────────────────────────────
// EARLY RETURNS — avoid deep nesting
// ─────────────────────────────────────────────

// ❌ BAD — nested if-else, hard to read and maintain
const updateUserBad = async (userId: string) => {
  if (userId) {
    const user = await getUserById(userId);
    if (user) {
      if (user.isActive) {
        if (user.hasPermissions) {
          await saveUser({ ...user, lastUpdated: new Date() });
        } else {
          console.log("User does not have permissions");
        }
      } else {
        console.log("User is not active");
      }
    } else {
      console.log("User not found");
    }
  } else {
    console.log("Invalid user ID");
  }
};

// ✅ GOOD — early returns keep the main path flat
const updateUserGood = async (userId: string) => {
  if (!userId) {
    console.log("Invalid user ID");
    return;
  }
  const user = await getUserById(userId);
  if (!user) {
    console.log("User not found");
    return;
  }
  if (!user.isActive) {
    console.log("User is not active");
    return;
  }
  if (!user.hasPermissions) {
    console.log("User does not have permissions");
    return;
  }
  await saveUser({ ...user, lastUpdated: new Date() });
};

// Stubs for the example above
interface UserStub {
  isActive: boolean;
  hasPermissions: boolean;
  lastUpdated: Date;
}
const getUserById = async (_id: string): Promise<UserStub | null> =>
  ({ isActive: true, hasPermissions: true, lastUpdated: new Date() });
const saveUser = async (_user: UserStub) => {};

// ─────────────────────────────────────────────
// const OVER let — prefer immutable bindings
// ─────────────────────────────────────────────

// ❌ BAD — let when value is never reassigned; mutable loop accumulator
// let total = 0;
// for (let i = 0; i < numbers.length; i++) {
//   total += numbers[i];
// }

// ✅ GOOD — const and reduce (or pure helper)
const numbers = [1, 2, 3, 4, 5];
const total = numbers.reduce((acc, num) => acc + num, 0);

// ✅ GOOD — const for conditional result via pure function
const getGreeting = (isAuthenticated: boolean): string =>
  isAuthenticated ? "Welcome back!" : "Hello, guest!";
const greeting = getGreeting(true);

// ─────────────────────────────────────────────
// Array.includes() — multiple comparisons
// ─────────────────────────────────────────────

const value = "b";

// ❌ BAD — repetitive comparisons
// if (value === "a" || value === "b" || value === "c") {
//   console.log("Value is a, b, or c");
// }

// ✅ GOOD — single includes check
const VALID_VALUES = ["a", "b", "c"];
if (VALID_VALUES.includes(value)) {
  console.log("Value is a, b, or c");
}

// ─────────────────────────────────────────────
// Array.some() — existence check (not find() !== undefined)
// ─────────────────────────────────────────────

interface Item {
  id: number;
  name: string;
  isActive: boolean;
}
const items: Item[] = [
  { id: 1, name: "Alice", isActive: false },
  { id: 2, name: "Bob", isActive: false },
  { id: 3, name: "Charlie", isActive: true },
];

// ❌ BAD — find then check for undefined
// const hasActive = items.find((item) => item.isActive) !== undefined;

// ✅ GOOD — intent is clear and returns boolean directly
const hasActiveItems = (list: Item[]) => list.some((item) => item.isActive);
const hasActive = hasActiveItems(items);

// ─────────────────────────────────────────────
// DESTRUCTURING / INTERMEDIATE VARIABLES — readability
// ─────────────────────────────────────────────
// Avoid long or nested expressions in template strings or conditionals; extract to named variables.

interface AddArgs {
  a: number;
  b: number;
}
const add = ({ a, b }: AddArgs) => a + b;
const double = (n: number) => n * 2;

const a = 5;
const b = 10;

// ❌ BAD — complex interpolation, hard to read and change
// const badMessage = `Sum of ${a} and ${b} is ${add({ a, b })}, double is ${double(add({ a, b }))}.`;

// ✅ GOOD — intermediate variables make the template clear
const sum = add({ a, b });
const doubledSum = double(sum);
const goodMessage = `Sum of ${a} and ${b} is ${sum}, double is ${doubledSum}.`;
