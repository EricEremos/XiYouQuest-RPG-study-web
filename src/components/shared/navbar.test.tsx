import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Navbar } from "./navbar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/image", () => ({
  default: ({ alt = "", ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

vi.mock("./xp-bar", () => ({
  XPBar: () => <div aria-label="Experience progress" />,
}));

vi.mock("./settings-dialog", () => ({
  SettingsDialog: () => null,
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { signOut: vi.fn() },
}));

describe("Navbar", () => {
  it("renders each navigation destination as one semantic interactive control", () => {
    const { container } = render(
      <Navbar
        totalXP={0}
        displayName="Traveler"
        avatarUrl={null}
        pendingRequestCount={0}
      />,
    );

    expect(screen.getAllByRole("link", { name: /leaderboard/i }).length).toBeGreaterThan(0);
    expect(container.querySelectorAll("a button")).toHaveLength(0);
    expect(container.querySelectorAll("button a")).toHaveLength(0);
  });
});
