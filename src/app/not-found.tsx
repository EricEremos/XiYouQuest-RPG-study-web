import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <section className="w-full max-w-lg space-y-5 bg-card p-6 text-center pixel-border chinese-corner sm:p-10">
        <p className="font-pixel text-sm text-primary pixel-glow">404</p>
        <h1 className="font-pixel text-lg leading-relaxed text-foreground">
          This path has left the journey
        </h1>
        <p className="text-muted-foreground">
          The page may have moved, or the route may no longer be available.
        </p>
        <Button asChild>
          <Link href="/dashboard">Return to XiYouQuest</Link>
        </Button>
      </section>
    </main>
  );
}
