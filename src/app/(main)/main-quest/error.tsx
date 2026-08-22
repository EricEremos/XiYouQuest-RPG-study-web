"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useEffect } from "react";

export default function MainQuestError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[MainQuest] Page unavailable", {
      digest: error.digest ?? "unknown",
    });
  }, [error]);

  return (
    <div className="mx-auto max-w-lg pixel-border bg-card p-6 text-center">
      <h2 className="font-pixel text-sm text-primary">Main Quest could not load</h2>
      <p className="mt-3 text-sm text-muted-foreground">
        We could not reach your quest progress. Check your connection and try again.
      </p>
      <Button className="mt-5" onClick={reset}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}
