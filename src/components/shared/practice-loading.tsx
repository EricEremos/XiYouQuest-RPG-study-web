interface PracticeLoadingProps {
  title: string;
  chinese: string;
  description: string;
}

/**
 * Route-identifying loading state for the practice component pages. Renders
 * the same H1 and subtitle as the loaded page so direct entries and reloads
 * identify the route on first paint, plus a polite status announcement while
 * the skeleton is visible.
 */
export function PracticeLoading({
  title,
  chinese,
  description,
}: PracticeLoadingProps) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-pixel text-base text-primary pixel-glow leading-relaxed">
          {title}
        </h1>
        <p className="text-muted-foreground">
          <span className="font-chinese">{chinese}</span> {description}
        </p>
      </div>
      {/* No aria-busy here: busy regions suppress announcements in some
          screen readers, which would silence the loading status itself. */}
      <div role="status" className="pixel-border p-4 sm:p-6 space-y-4">
        <p className="sr-only">Loading {title}. Please wait.</p>
        <div aria-hidden="true" className="space-y-4">
          <div className="h-24 w-24 mx-auto rounded-full animate-shimmer" />
          <div className="h-16 w-full rounded animate-shimmer" />
          <div className="h-10 w-32 mx-auto rounded animate-shimmer" />
        </div>
        <p
          aria-hidden="true"
          className="text-center text-sm text-muted-foreground font-retro"
        >
          Loading practice session...
        </p>
      </div>
    </div>
  );
}
