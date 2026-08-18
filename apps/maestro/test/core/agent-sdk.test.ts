// The Agent SDK's child environment, and the two properties that are one edit apart from silently
// costing money or breaking a GUI launch.
//
// The query itself is not tested here: it spawns the user's own `claude`, costs tokens, and its
// interesting failures are packaging failures that no vitest run can reach. That half is verified
// by launching the packaged app (see `runAgentSdkSmoke` and apps/maestro/CLAUDE.md).

import { describe, it, expect } from "vitest";
import { agentChildEnv, billingFrom, BILLING_ENV_VARS, AGENT_SDK_PACKAGE } from "../../src/core/agent-sdk.js";

const HOME = "/home/tester";

describe("the child environment", () => {
  it("carries no billing credential the parent had", () => {
    const { env, dropped } = agentChildEnv({
      env: { PATH: "/usr/bin", ANTHROPIC_API_KEY: "sk-ant-live", ANTHROPIC_AUTH_TOKEN: "tok" },
      home: HOME,
      platform: "linux",
    });

    // `in`, not `=== undefined`: absence is the property, and a key present-but-undefined would
    // pass a truthiness check while still being something the SDK could spread forward.
    for (const key of BILLING_ENV_VARS) expect(key in env).toBe(false);
    expect(dropped).toEqual([...BILLING_ENV_VARS]);
  });

  it("still carries PATH — the whole reason `env` is dangerous", () => {
    // The SDK's `env` REPLACES the subprocess environment rather than merging into it. So the
    // naive way to drop an API key also drops PATH, and the CLI shells out to git and to hooks.
    const { env } = agentChildEnv({ env: { PATH: "/usr/bin" }, home: HOME, platform: "linux" });
    const dirs = (env.PATH ?? "").split(":");

    expect(dirs).toContain("/usr/bin");
    // And the EXPANDED path, not the app's own: a desktop-launched Electron process never sees
    // ~/.local/bin, which is where the installer puts `claude`.
    expect(dirs).toContain(`${HOME}/.local/bin`);
  });

  it("reports provider variables rather than removing them", () => {
    // A Bedrock or Vertex deployment is a thing the user configured on purpose; dropping it would
    // break a working setup to defend an assumption. Being silent about it is the other failure.
    const { env, otherProviderVars, dropped } = agentChildEnv({
      env: { PATH: "/usr/bin", CLAUDE_CODE_USE_BEDROCK: "1" },
      home: HOME,
      platform: "linux",
    });

    expect(env.CLAUDE_CODE_USE_BEDROCK).toBe("1");
    expect(otherProviderVars).toEqual(["CLAUDE_CODE_USE_BEDROCK"]);
    expect(dropped).toEqual([]);
  });

  it("passes a clean parent through unchanged apart from PATH", () => {
    const { env, dropped, otherProviderVars } = agentChildEnv({
      env: { PATH: "/usr/bin", HOME, LANG: "en_US.UTF-8" },
      home: HOME,
      platform: "linux",
    });

    expect(env.HOME).toBe(HOME);
    expect(env.LANG).toBe("en_US.UTF-8");
    expect(dropped).toEqual([]);
    expect(otherProviderVars).toEqual([]);
  });
});

describe("billing, as the CLI reports it", () => {
  it("reads a subscription from the two sources that mean no API key", () => {
    // "none" is not in the documented ApiKeySource union but is what the CLI emits at runtime for
    // an OAuth login — which is exactly the state this app wants to be in.
    expect(billingFrom("oauth")).toBe("subscription");
    expect(billingFrom("none")).toBe("subscription");
  });

  it("calls every other source an API bill", () => {
    for (const source of ["user", "project", "org", "temporary"]) {
      expect(billingFrom(source)).toBe("api-key");
    }
  });

  it("does not guess when the init message said nothing", () => {
    expect(billingFrom(null)).toBe("unknown");
  });
});

describe("the package name", () => {
  it("is the CLI-spawning SDK and not the REST client", () => {
    // The one that takes an API key and bills pay-as-you-go is `@anthropic-ai/sdk`. One path
    // segment apart, both install cleanly, and the wrong one defeats the entire point.
    expect(AGENT_SDK_PACKAGE).toBe("@anthropic-ai/claude-agent-sdk");
  });
});
