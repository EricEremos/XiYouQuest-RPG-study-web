"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CharacterDisplay } from "@/components/character/character-display";
import { DialogueBox } from "@/components/character/dialogue-box";
import { AudioRecorder } from "@/components/practice/audio-recorder";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { fetchWithRetry } from "@/lib/fetch-retry";
import { assessC4Passage } from "@/lib/psc/c4-passage-assessment";
import { getDialogue } from "@/lib/dialogue";
import { ChineseText } from "@/components/shared/chinese-text";
import { useAudioSettings } from "@/components/shared/audio-settings";
import { useAchievementToast } from "@/components/shared/achievement-toast";
import type { ExpressionName } from "@/types/character";
import type { ComponentNumber } from "@/types/practice";
import type { ReadingPassageSource } from "@/lib/psc/reading-passage-source";

interface Passage {
  id: string;
  title: string;
  content: string;
  passageNumber: number | null;
  syllableCount: number;
  source: ReadingPassageSource;
}

interface ReadingSessionProps {
  passages: Passage[];
  character: {
    name: string;
    personalityPrompt: string;
    voiceId: string;
    expressions: Record<string, string>;
  };
  characterId?: string;
  component: ComponentNumber;
  playerMemory?: string;
  lpNodeId?: string;
}

type SessionPhase =
  | "select"
  | "ready"
  | "listening-model"
  | "recording"
  | "assessing"
  | "feedback"
  | "complete";

interface SentenceScore {
  sentence: string;
  score: number;
}

// Split passage content into sentences based on Chinese punctuation
function splitIntoSentences(content: string): string[] {
  const sentences = content.split(/(?<=[。！？；])/g).filter((s) => s.trim().length > 0);
  return sentences;
}

export function ReadingSession({ passages, character, characterId, component, lpNodeId }: ReadingSessionProps) {
  const router = useRouter();
  const { showAchievementToasts } = useAchievementToast();
  const { applyTtsVolume, applyUtteranceVolume } = useAudioSettings();
  const [selectedPassage, setSelectedPassage] = useState<Passage | null>(null);
  const [phase, setPhase] = useState<SessionPhase>("select");
  const [expression, setExpression] = useState<ExpressionName>("neutral");
  const [dialogue, setDialogue] = useState(getDialogue(character.name, "c4_initial"));

  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [playingSentenceIndex, setPlayingSentenceIndex] = useState<number | null>(null);
  const [overallScore, setOverallScore] = useState<number | null>(null);
  const [sentenceScores, setSentenceScores] = useState<SentenceScore[]>([]);
  const [totalXPEarned, setTotalXPEarned] = useState(0);
  const [, setFeedbackText] = useState("");
  const [progressSaveError, setProgressSaveError] = useState<string | null>(null);
  const [progressSaveAttempt, setProgressSaveAttempt] = useState(0);
  const hasPlayedGreeting = useRef(false);

  // Background overlay ref for passage images (DOM-managed on body)
  const bgOverlayRef = useRef<HTMLDivElement | null>(null);

  // Client-side audio cache: Map<text, audioUrl>
  const audioCache = useRef(new Map<string, string>());
  // Reference to current playing audio for stop functionality
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  // Abort flag for sequential model reading
  const modelReadingAbortRef = useRef(false);

  const sentences = useMemo(
    () => (selectedPassage ? splitIntoSentences(selectedPassage.content) : []),
    [selectedPassage]
  );

  const speakWithBrowserTTS = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "zh-CN";
      utterance.rate = 0.9;
      applyUtteranceVolume(utterance);
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }, [applyUtteranceVolume]);

  // Stop currently playing audio
  const stopAudio = useCallback(() => {
    modelReadingAbortRef.current = true;
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    setIsPlayingAudio(false);
    setIsLoadingAudio(false);
    setPlayingSentenceIndex(null);
  }, []);

  // Stop audio on unmount (when navigating to another page)
  useEffect(() => {
    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      window.speechSynthesis.cancel();
    };
  }, []);

  // Create background overlay on body (outside component stacking context)
  useEffect(() => {
    document.body.style.isolation = "isolate";
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: -1;
      background-size: cover; background-position: center; background-attachment: fixed;
      opacity: 0; transition: opacity 0.6s ease-in-out; pointer-events: none;
    `;
    document.body.appendChild(overlay);
    bgOverlayRef.current = overlay;

    return () => {
      overlay.remove();
      bgOverlayRef.current = null;
      document.body.style.isolation = "";
    };
  }, []);

  // Greeting on mount (voice disabled)
  useEffect(() => {
    if (!hasPlayedGreeting.current) {
      hasPlayedGreeting.current = true;
    }
  }, []);

  // Save progress when reading assessment completes
  const hasSavedProgress = useRef(false);
  const hasRecordedProgress = useRef(false);
  const progressAttemptId = useRef<string | null>(null);
  const isSavingProgress = useRef(false);
  useEffect(() => {
    if (
      phase !== "feedback" ||
      overallScore === null ||
      !characterId ||
      hasSavedProgress.current ||
      isSavingProgress.current
    ) return;
    isSavingProgress.current = true;
    let cancelled = false;

    const saveProgress = async () => {
      try {
        if (!hasRecordedProgress.current) {
          progressAttemptId.current ??= crypto.randomUUID();
          const res = await fetchWithRetry("/api/progress/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              characterId,
              attemptId: progressAttemptId.current,
              component,
              score: overallScore,
              xpEarned: totalXPEarned,
              durationSeconds: 0,
              questionsAttempted: 1,
              questionsCorrect: overallScore >= 60 ? 1 : 0,
              bestStreak: overallScore >= 60 ? 1 : 0,
            }),
          }, { maxRetries: 0 });
          if (!res.ok) throw new Error(`Progress update failed (${res.status})`);
          const data = await res.json();
          hasRecordedProgress.current = true;
          if (data.newAchievements?.length > 0) {
            showAchievementToasts(data.newAchievements);
          }
        }

        if (lpNodeId) {
          const nodeResponse = await fetchWithRetry("/api/learning/node/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              nodeId: lpNodeId,
              score: overallScore,
              xpEarned: totalXPEarned,
            }),
          });
          if (!nodeResponse.ok) throw new Error(`Learning Path update failed (${nodeResponse.status})`);
        }

        if (cancelled) return;
        hasSavedProgress.current = true;
        setProgressSaveError(null);
        if (lpNodeId) router.push("/learning-path");
      } catch (err) {
        console.error("Failed to save C4 progress:", err);
        if (!cancelled) {
          setProgressSaveError("Your assessment is ready, but progress could not be saved. Retry before leaving this page.");
        }
      } finally {
        isSavingProgress.current = false;
      }
    };

    void saveProgress();
    return () => {
      cancelled = true;
    };
  }, [phase, overallScore, progressSaveAttempt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Play the entire passage as a model reading (sentence-by-sentence to avoid Vercel timeout)
  const playModelReading = useCallback(async () => {
    if (!selectedPassage || isPlayingAudio || isLoadingAudio) return;
    modelReadingAbortRef.current = false;
    setIsLoadingAudio(true);
    setPhase("listening-model");
    setExpression("happy");
    setDialogue(getDialogue(character.name, "c4_loading_model"));

    const passageSentences = splitIntoSentences(selectedPassage.content);

    const onFinished = () => {
      setIsPlayingAudio(false);
      setIsLoadingAudio(false);
      setPlayingSentenceIndex(null);
      setPhase("ready");
      setExpression("encouraging");
      setDialogue(getDialogue(character.name, "c4_your_turn"));
    };

    setIsLoadingAudio(false);
    setIsPlayingAudio(true);
    setDialogue(getDialogue(character.name, "c4_listening"));

    for (let i = 0; i < passageSentences.length; i++) {
      if (modelReadingAbortRef.current) break;
      setPlayingSentenceIndex(i);
      const sentenceText = passageSentences[i].trim();
      if (!sentenceText) continue;

      try {
        const cacheKey = `${character.voiceId}:${sentenceText}`;
        let audioUrl = audioCache.current.get(cacheKey);

        if (!audioUrl) {
          const response = await fetchWithRetry("/api/tts/speak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ voiceId: character.voiceId, text: sentenceText }),
          });
          if (response.ok) {
            const blob = await response.blob();
            audioUrl = URL.createObjectURL(blob);
            audioCache.current.set(cacheKey, audioUrl);
          }
        }

        if (modelReadingAbortRef.current) break;

        if (audioUrl) {
          await new Promise<void>((resolve) => {
            const audio = new Audio(audioUrl);
            applyTtsVolume(audio);
            currentAudioRef.current = audio;
            audio.onended = () => { currentAudioRef.current = null; resolve(); };
            audio.onerror = () => { currentAudioRef.current = null; resolve(); };
            audio.play().catch(() => resolve());
          });
        } else {
          await speakWithBrowserTTS(sentenceText);
        }
      } catch {
        try { await speakWithBrowserTTS(sentenceText); } catch { /* ignore */ }
      }
    }

    onFinished();
  }, [selectedPassage, character.voiceId, isPlayingAudio, isLoadingAudio, speakWithBrowserTTS, applyTtsVolume, character.name]);

  // Play a single sentence (with client-side caching)
  const playSentence = useCallback(async (sentence: string, index: number) => {
    if (isPlayingAudio) return;
    setIsPlayingAudio(true);
    setPlayingSentenceIndex(index);

    const onFinished = () => {
      setIsPlayingAudio(false);
      setPlayingSentenceIndex(null);
    };

    const sentenceText = sentence.trim();
    const cacheKey = `${character.voiceId}:${sentenceText}`;

    // Check client-side cache first
    const cachedAudioUrl = audioCache.current.get(cacheKey);
    if (cachedAudioUrl) {
      // Play from cache - no network request!
      const audio = new Audio(cachedAudioUrl);
      applyTtsVolume(audio);
      currentAudioRef.current = audio; // Store reference for stop button
      audio.onended = () => {
        currentAudioRef.current = null;
        onFinished();
      };
      audio.onerror = async () => {
        currentAudioRef.current = null;
        await speakWithBrowserTTS(sentenceText);
        onFinished();
      };
      try {
        await audio.play();
      } catch {
        currentAudioRef.current = null;
        await speakWithBrowserTTS(sentenceText);
        onFinished();
      }
      return;
    }

    // Not in cache - fetch from server
    try {
      const response = await fetchWithRetry("/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceId: character.voiceId,
          text: sentenceText,
        }),
      });

      if (response.ok) {
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);

        // Cache the audio URL for next time
        audioCache.current.set(cacheKey, audioUrl);

        const audio = new Audio(audioUrl);
        applyTtsVolume(audio);
        currentAudioRef.current = audio; // Store reference for stop button
        audio.onended = () => {
          currentAudioRef.current = null;
          onFinished();
        };
        audio.onerror = async () => {
          currentAudioRef.current = null;
          await speakWithBrowserTTS(sentenceText);
          onFinished();
        };
        await audio.play();
      } else {
        await speakWithBrowserTTS(sentenceText);
        onFinished();
      }
    } catch {
      try {
        await speakWithBrowserTTS(sentenceText);
      } catch { /* ignore */ }
      onFinished();
    }
  }, [character.voiceId, isPlayingAudio, speakWithBrowserTTS, applyTtsVolume]);

  // Handle recording completion
  const handleRecordingComplete = useCallback(async (audioBlob: Blob) => {
    if (!selectedPassage) return;

    setPhase("assessing");
    setExpression("thinking");
    setDialogue(getDialogue(character.name, "c4_analyzing"));

    try {
      const assessment = await assessC4Passage(
        audioBlob,
        selectedPassage.content,
        async (blob, referenceText, category) => {
          const formData = new FormData();
          formData.append("audio", blob, "recording.wav");
          formData.append("referenceText", referenceText);
          formData.append("category", category);

          const response = await fetchWithRetry("/api/speech/assess", {
            method: "POST",
            body: formData,
          });
          if (!response.ok) throw new Error(`Assessment failed (${response.status})`);
          return response.json();
        },
      );
      const pronunciationScore = assessment.score;
      const sentenceResults = assessment.sentenceScores;

      setOverallScore(pronunciationScore);
      setSentenceScores(sentenceResults);

      const isGood = pronunciationScore >= 60;
      const isPerfect = pronunciationScore >= 90;

      setTotalXPEarned(assessment.xpEarned);

      // Get AI character feedback
      setPhase("feedback");

      let spokenFeedback = "";
      try {
        const feedbackResponse = await fetchWithRetry("/api/ai/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterId,
            component: 4,
            questionText: `Passage: "${selectedPassage.title}" - ${selectedPassage.content.substring(0, 100)}...`,
            userAnswer: "Passage reading attempt",
            pronunciationScore,
            isCorrect: isGood,
          }),
        });

        if (feedbackResponse.ok) {
          const feedbackData = await feedbackResponse.json();
          spokenFeedback = feedbackData.feedback;
          setFeedbackText(spokenFeedback);
          setDialogue(spokenFeedback);
        } else {
          spokenFeedback = isPerfect
            ? "Outstanding reading! Your pronunciation, pacing, and fluency were excellent!"
            : isGood
            ? "Good reading! Focus on maintaining a steady pace and clear tones throughout."
            : "Keep practicing! Pay attention to each character's tone and try to read more smoothly.";
          setFeedbackText(spokenFeedback);
          setDialogue(spokenFeedback);
        }
      } catch {
        spokenFeedback = isPerfect
          ? `Excellent! Score: ${pronunciationScore}/100!`
          : isGood
          ? `Good effort! Score: ${pronunciationScore}/100.`
          : `Score: ${pronunciationScore}/100. Keep practicing!`;
        setFeedbackText(spokenFeedback);
        setDialogue(spokenFeedback);
      }

      // Set expression based on score and voice the feedback
      const feedbackExpression: ExpressionName = isPerfect ? "excited" : isGood ? "happy" : "encouraging";
      setExpression(feedbackExpression);

      // Companion voice disabled
    } catch {
      setPhase("ready");
      setExpression("surprised");
      setDialogue(getDialogue(character.name, "c4_error"));
      setOverallScore(null);
      setFeedbackText("Assessment failed");
    }
  }, [selectedPassage, sentences, characterId, character.name]);

  // Select a passage
  const handleSelectPassage = useCallback((passage: Passage) => {
    setSelectedPassage(passage);
    setPhase("ready");
    setExpression("neutral");
    setDialogue(`Great choice! "${passage.title}" - First listen to the model reading, then try reading it yourself.`);

    // Fade in passage background image
    if (passage.passageNumber && bgOverlayRef.current) {
      const url = `/img/passage/${passage.passageNumber}.webp`;
      const overlay = bgOverlayRef.current;
      const img = new Image();
      img.onload = () => {
        overlay.style.backgroundImage = `url(${url})`;
        requestAnimationFrame(() => { overlay.style.opacity = "1"; });
      };
      img.src = url;
    }
  }, []);

  // Go back to passage selection
  const handleBackToSelection = useCallback(() => {
    // Stop any playing audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    window.speechSynthesis.cancel();
    setIsPlayingAudio(false);
    setIsLoadingAudio(false);
    setPlayingSentenceIndex(null);

    setSelectedPassage(null);
    setPhase("select");
    setOverallScore(null);
    setSentenceScores([]);
    setTotalXPEarned(0);
    setFeedbackText("");
    setProgressSaveError(null);
    hasSavedProgress.current = false;
    hasRecordedProgress.current = false;
    progressAttemptId.current = null;

    setExpression("neutral");
    setDialogue(getDialogue(character.name, "c4_initial"));

    // Fade out passage background
    if (bgOverlayRef.current) {
      bgOverlayRef.current.style.opacity = "0";
    }
  }, [character.name]);

  // Passage selection screen
  if (phase === "select") {
    return (
      <div className="space-y-4">

        <div className="flex flex-col gap-4 md:flex-row">
          {/* Left side: Character (30%) */}
          <div className="space-y-3 md:w-[30%]">
            <CharacterDisplay
              characterName={character.name}
              expressionImages={character.expressions}
              currentExpression={expression}
            />
            <DialogueBox text={dialogue} characterName={character.name} />
          </div>

          {/* Right side: Passage selection (70%) */}
          <div className="flex-1 md:w-[70%]">
            <div className="grid gap-4 sm:grid-cols-2 max-h-[70vh] overflow-y-auto pr-2">
              {passages.map((passage) => (
                <Card
                  key={passage.id}
                  className="transition-all hover:border-primary hover:shadow-md focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/50 h-fit relative overflow-hidden"
                >
                  {passage.passageNumber && (
                    <div
                      className="absolute inset-0 bg-cover bg-center opacity-25"
                      style={{ backgroundImage: `url(/img/passage/${passage.passageNumber}.webp)` }}
                    />
                  )}
                  <CardContent className="pt-6 relative">
                    <h3 className="text-lg font-bold font-chinese mb-2 drop-shadow-md [text-shadow:_0_1px_3px_rgb(255_255_255_/_80%)]">{passage.title}</h3>
                    <p className="text-sm font-medium text-foreground/80 font-chinese line-clamp-3 [text-shadow:_0_1px_2px_rgb(255_255_255_/_60%)]">
                      <ChineseText text={passage.content} />
                    </p>
                    <p className="mt-2 text-sm font-medium text-foreground/70 [text-shadow:_0_1px_2px_rgb(255_255_255_/_60%)]">
                      {passage.syllableCount} scoped Han characters · XiYouQuest practice scope: first 400
                    </p>
                    <p className="mt-1 text-xs text-foreground/60 [text-shadow:_0_1px_2px_rgb(255_255_255_/_60%)]">
                      {passage.source.label}
                    </p>
                  </CardContent>
                  {/* Native button covering the card: one Tab stop with a
                      stable name, Enter/Space activation, focus ring above. */}
                  <button
                    type="button"
                    onClick={() => handleSelectPassage(passage)}
                    aria-label={`Practice passage: ${passage.title}`}
                    className="absolute inset-0 z-10 cursor-pointer focus:outline-none"
                  />
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Completion / feedback screen
  if (phase === "complete" || (phase === "feedback" && overallScore !== null)) {
    const isGood = (overallScore ?? 0) >= 60;

    return (
      <div className="space-y-4">

        <div className="flex flex-col gap-4 md:flex-row">
          {/* Left side: Character (30%) */}
          <div className="space-y-3 md:w-[30%]">
            <CharacterDisplay
              characterName={character.name}
              expressionImages={character.expressions}
              currentExpression={expression}
            />
            <DialogueBox text={dialogue} characterName={character.name} />

            <div className="flex flex-col gap-2">
              {lpNodeId ? (
                progressSaveError ? (
                  <>
                    <p role="alert" className="text-sm text-destructive text-center">{progressSaveError}</p>
                    <Button
                      onClick={() => {
                        setProgressSaveError(null);
                        setProgressSaveAttempt((attempt) => attempt + 1);
                      }}
                      className="w-full"
                    >
                      Retry Saving Progress
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground animate-pulse text-center">Saving progress and returning to Learning Path...</p>
                )
              ) : (
                <>
                  {progressSaveError && (
                    <>
                      <p role="alert" className="text-sm text-destructive text-center">{progressSaveError}</p>
                      <Button
                        onClick={() => {
                          setProgressSaveError(null);
                          setProgressSaveAttempt((attempt) => attempt + 1);
                        }}
                        className="w-full"
                      >
                        Retry Saving Progress
                      </Button>
                    </>
                  )}
                  <Button onClick={() => {
                    setPhase("ready");
                    setOverallScore(null);
                    setSentenceScores([]);
                    setFeedbackText("");
                    setProgressSaveError(null);
                    hasSavedProgress.current = false;
                    hasRecordedProgress.current = false;
                    progressAttemptId.current = null;
                    setExpression("neutral");
                    setDialogue(getDialogue(character.name, "c4_retry"));
                  }} className="w-full">
                    Try Again
                  </Button>
                  <Button variant="outline" onClick={handleBackToSelection} className="w-full">
                    Choose Another Passage
                  </Button>
                  <Button variant="outline" asChild className="w-full">
                    <Link href="/practice">Back to Practice</Link>
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Right side: Results (70%) */}
          <div className="flex-1 md:w-[70%]">
            <Card className="h-full">
              <CardContent className="pt-4 space-y-3">
                <h2 className="font-pixel text-sm text-center">
                  Reading Assessment: <span className="font-chinese text-base">{selectedPassage?.title}</span>
                </h2>

                {/* Overall score + stats row */}
                <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6">
                  {overallScore !== null && (
                    <div className="text-center">
                      <p
                        className={`text-3xl sm:text-4xl font-bold ${
                          overallScore >= 90
                            ? "text-green-600"
                            : overallScore >= 60
                            ? "text-yellow-600"
                            : "text-red-600"
                        }`}
                      >
                        {overallScore}
                      </p>
                      <p className="text-sm text-muted-foreground">Score</p>
                    </div>
                  )}
                  <div className="h-8 w-px bg-border" />
                  <div className="text-center">
                    <p className="text-2xl font-bold text-yellow-600">+{totalXPEarned}</p>
                    <p className="text-sm text-muted-foreground">XP</p>
                  </div>
                  <div className="h-8 w-px bg-border" />
                  <div className="text-center">
                    <p className="text-2xl font-bold">{isGood ? "Pass" : "Retry"}</p>
                    <p className="text-sm text-muted-foreground">Result</p>
                  </div>
                </div>

                {overallScore !== null && (
                  <Progress value={overallScore} className="h-2" />
                )}

                {/* Sentence-by-sentence breakdown */}
                {sentenceScores.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">Sentence breakdown:</p>
                    <div className="max-h-96 overflow-y-auto space-y-1">
                      {sentenceScores.map((item, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 rounded-md border px-2 py-2"
                        >
                          <span className="flex-1 min-w-0 truncate font-chinese text-base">{item.sentence}</span>
                          <span
                            className={`text-xl font-bold tabular-nums shrink-0 ${
                              item.score >= 90
                                ? "text-green-600"
                                : item.score >= 60
                                ? "text-yellow-600"
                                : "text-red-600"
                            }`}
                          >
                            {item.score}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Main reading UI (ready, listening-model, recording, assessing)
  return (
    <div className="space-y-4">
      {/* Main content area */}
      <div className="flex flex-col gap-4 md:flex-row">
        {/* Left side: Character (30%) */}
        <div className="space-y-3 md:w-[30%]">
          <CharacterDisplay
            characterName={character.name}
            expressionImages={character.expressions}
            currentExpression={expression}
          />
          <DialogueBox text={dialogue} characterName={character.name} />

          {/* Action buttons */}
          <div className="flex flex-col gap-2">
            {isLoadingAudio ? (
              <Button
                disabled
                variant="outline"
                className="w-full"
              >
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                Loading Audio...
              </Button>
            ) : isPlayingAudio ? (
              <Button
                onClick={stopAudio}
                variant="destructive"
                className="w-full"
              >
                ⏹ Stop Audio
              </Button>
            ) : (
              <Button
                onClick={playModelReading}
                disabled={phase === "assessing"}
                variant="outline"
                className="w-full"
              >
                🔊 Listen to Model
              </Button>
            )}

            {(phase === "ready" || phase === "listening-model") && (
              <AudioRecorder
                onRecordingComplete={handleRecordingComplete}
                disabled={isPlayingAudio}
              />
            )}
          </div>
        </div>

        {/* Right side: Passage area (70%) */}
        <div className="flex-1 md:w-[70%]">
          <Card className="h-full">
            <CardContent className="py-6 space-y-4">
              {/* Passage header */}
              <h2 className="text-xl font-bold font-chinese">{selectedPassage?.title}</h2>
              <p className="text-xs text-muted-foreground">
                {selectedPassage?.source.label}
              </p>

              {/* Click hint / Stop button */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                  </svg>
                  <span>Click any sentence to hear it read aloud</span>
                </div>
                {isPlayingAudio && playingSentenceIndex !== null && (
                  <Button
                    onClick={stopAudio}
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    ⏹ Stop
                  </Button>
                )}
              </div>

              {/* Passage content with per-sentence playback. Each sentence is
                  a native button: one Tab stop, Enter/Space plays audio, and
                  aria-pressed exposes which sentence is playing. */}
              <div className="rounded-lg border bg-muted/30 p-4 sm:p-6 leading-relaxed max-h-[60vh] overflow-y-auto">
                {sentences.map((sentence, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => playSentence(sentence, index)}
                    aria-label={`Play sentence ${index + 1}: ${sentence}`}
                    aria-pressed={playingSentenceIndex === index}
                    className={`
                      inline cursor-pointer text-left transition-all duration-200 rounded-md px-1 py-0.5
                      focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2
                      ${playingSentenceIndex === index
                        ? "bg-primary/30 text-primary font-medium shadow-sm scale-105"
                        : "hover:bg-primary/10 hover:shadow-sm hover:scale-[1.02]"
                      }
                    `}
                    title="🔊 Click to hear this sentence"
                  >
                    <span className="text-lg leading-loose font-chinese">{sentence}</span>
                  </button>
                ))}
              </div>

              {/* Assessing state */}
              {phase === "assessing" && (
                <div className="text-center space-y-2 py-4">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    Analyzing your reading... checking pronunciation, pacing, and fluency.
                  </p>
                </div>
              )}

              {/* Back button */}
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={handleBackToSelection}>
                  Choose Different Passage
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
