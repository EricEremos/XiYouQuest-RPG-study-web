"use client";

interface DialogueBoxProps {
  text: string;
  characterName: string;
  /** Kept for call-site compatibility; text now always renders in full. */
  isTyping?: boolean;
  /** Kept for call-site compatibility; text now always renders in full. */
  typingSpeed?: number;
}

/**
 * Companion speech bubble used across the practice components. The previous
 * character-by-character typewriter effect left sentences looking truncated
 * with a blinking underscore for several seconds on every message, so the full
 * text now appears immediately with a short fade. aria-live announces new
 * dialogue to screen readers.
 */
export function DialogueBox({ text, characterName }: DialogueBoxProps) {
  return (
    <div className="pixel-border bg-card p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="inline-block h-2 w-2 bg-pixel-green" />
        <p className="font-pixel text-sm text-primary">{characterName}</p>
      </div>
      {/* The live region stays mounted across messages (screen readers only
          announce mutations inside an EXISTING live region); only the inner
          span is keyed so the fade replays per message. */}
      <p aria-live="polite" className="text-sm leading-relaxed">
        <span key={text} className="block animate-fade-in-up">
          {text}
        </span>
      </p>
    </div>
  );
}
