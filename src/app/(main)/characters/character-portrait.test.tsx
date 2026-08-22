import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CharacterPortrait } from "./character-portrait";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CharacterPortrait", () => {
  it("replaces a failed portrait with a named usable fallback", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(performance, "getEntriesByName").mockReturnValue([]);

    render(<CharacterPortrait src="/img/missing-portrait.png" name="Kaede" isUnlocked />);

    fireEvent.error(screen.getByAltText("Kaede"));

    expect(screen.getByText("Kaede")).toBeInTheDocument();
    expect(screen.getByText("Portrait unavailable")).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith("[LoadMetric] Character portrait failed", {
      name: "Kaede",
      durationMs: null,
    });
  });
});
