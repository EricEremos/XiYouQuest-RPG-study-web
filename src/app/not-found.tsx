import { headers } from "next/headers";
import Link from "next/link";
import { BackButton } from "@/components/shared/back-button";

/**
 * Branded recovery page for unknown routes. Replaces the framework default
 * 404, which had no landmark, heading, or way back into the app.
 */
export default async function NotFound() {
  // Reading request headers forces dynamic rendering, so the per-request CSP
  // nonce set by src/proxy.ts is applied to this page's scripts.
  await headers();

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md pixel-border chinese-corner bg-card p-6 space-y-4 text-center">
        <p className="font-pixel text-sm text-muted-foreground">404</p>
        <h1 className="font-pixel text-base text-primary">Page Not Found</h1>
        <p className="font-chinese text-lg text-muted-foreground">
          此路不通，施主请回
        </p>
        <p className="text-muted-foreground">
          This path leads nowhere on the journey. The page may have moved, or
          the address may be mistyped.
        </p>
        <div className="flex flex-col gap-2">
          <Link
            href="/dashboard"
            className="pixel-btn bg-primary text-primary-foreground px-6 py-2.5 font-pixel text-sm hover:brightness-110 transition-all inline-flex items-center justify-center"
          >
            Return to Dashboard
          </Link>
          <BackButton />
        </div>
        <p className="text-sm text-muted-foreground">
          If a link inside XiYouQuest brought you here, please report it through
          your course channel so we can fix it.
        </p>
      </div>
    </main>
  );
}
