import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CharactersError from "./error";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Characters recovery boundary", () => {
  it("shows an actionable retry without exposing the failed query", () => {
    const reset = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("profile query details must stay private"), {
      digest: "characters-digest",
    });

    render(<CharactersError error={error} reset={reset} />);

    expect(screen.getByRole("heading", { name: "Characters could not load" })).toBeInTheDocument();
    expect(screen.getByText("Your companion data is safe. Check your connection and try again.")).toBeInTheDocument();
    expect(screen.queryByText("profile query details must stay private")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(reset).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith("[Characters] Page unavailable", { digest: "characters-digest" });
  });
});
