import { describe, expect, it } from "vitest";

import { createContentSecurityPolicy } from "@/lib/security-headers";

describe("createContentSecurityPolicy", () => {
  it("uses a nonce and excludes unsafe script directives in production", () => {
    const policy = createContentSecurityPolicy("test-nonce", false);

    expect(policy).toContain("script-src 'self' 'nonce-test-nonce' 'strict-dynamic'");
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
  });

  it("allows only the development exceptions required by Next.js", () => {
    const policy = createContentSecurityPolicy("test-nonce", true);

    expect(policy).toContain("'unsafe-eval'");
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
  });
});
