"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * History-back control for recovery pages (e.g. the branded 404).
 */
export function BackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="pixel-btn border-2 border-border bg-background px-6 py-2.5 font-pixel text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
    >
      <ArrowLeft className="h-4 w-4" />
      Go Back
    </button>
  );
}
