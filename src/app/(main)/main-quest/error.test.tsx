import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import MainQuestError from "./error";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Main Quest recovery boundary", () => {
  it("shows an actionable retry without exposing the query error", () => {
    const reset = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("database details must stay private"), {
      digest: "quest-digest",
    });

    render(<MainQuestError error={error} reset={reset} />);

    expect(screen.getByRole("heading", { name: "Main Quest could not load" })).toBeInTheDocument();
    expect(screen.getByText("We could not reach your quest progress. Check your connection and try again.")).toBeInTheDocument();
    expect(screen.queryByText("database details must stay private")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(reset).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith("[MainQuest] Page unavailable", { digest: "quest-digest" });
  });
});
