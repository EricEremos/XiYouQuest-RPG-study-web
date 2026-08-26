"use client";

import Image from "next/image";
import { ImageOff } from "lucide-react";
import { useState } from "react";

interface CharacterPortraitProps {
  src: string | undefined;
  name: string;
  isUnlocked: boolean;
}

export function CharacterPortrait({ src, name, isUnlocked }: CharacterPortraitProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    src ? "loading" : "error"
  );

  function recordImageResult(result: "loaded" | "failed", currentSrc: string) {
    const resourceEntry = performance.getEntriesByName(currentSrc).at(-1);
    const durationMs = resourceEntry ? Math.round(resourceEntry.duration * 10) / 10 : null;
    const metric = { name, durationMs };

    if (result === "failed") {
      console.error("[LoadMetric] Character portrait failed", metric);
    } else {
      console.info("[LoadMetric] Character portrait loaded", metric);
    }
  }

  return (
    <div className="absolute inset-0">
      {status === "loading" && (
        <div className="absolute inset-0 animate-shimmer" aria-label={`Loading ${name} portrait`} />
      )}
      {src && status !== "error" && (
        <Image
          src={src}
          alt={name}
          fill
          className={`object-contain transition-opacity duration-200 ${
            status === "loaded" ? "opacity-100" : "opacity-0"
          } ${!isUnlocked ? "blur-[2px] brightness-50" : ""}`}
          onLoad={(event) => {
            setStatus("loaded");
            recordImageResult("loaded", event.currentTarget.currentSrc);
          }}
          onError={(event) => {
            setStatus("error");
            recordImageResult("failed", event.currentTarget.currentSrc);
          }}
        />
      )}
      {status === "error" && (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-3 text-center text-muted-foreground">
          <ImageOff className="h-7 w-7" />
          <span className="text-sm font-medium">{name}</span>
          <span className="text-xs">Portrait unavailable</span>
        </div>
      )}
    </div>
  );
}
