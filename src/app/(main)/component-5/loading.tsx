export default function Component5Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading Component 5 practice">
      <span className="sr-only">Loading Component 5 practice</span>
      <div>
        <p className="font-pixel text-sm text-primary">Preparing Prompted Speaking</p>
        <p className="mt-2 text-sm text-muted-foreground">Loading topics and your Study Buddy…</p>
      </div>
      <div className="pixel-border p-4 sm:p-6 space-y-4">
        <div className="h-24 w-24 mx-auto rounded-full animate-shimmer" />
        <div className="h-16 w-full rounded animate-shimmer" />
        <div className="h-10 w-32 mx-auto rounded animate-shimmer" />
      </div>
    </div>
  );
}
