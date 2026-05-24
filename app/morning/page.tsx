"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Moon, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSignedInUser } from "@/lib/auth";
import { saveHealthStateWithHistory, storageKey } from "@/lib/health-sync";
import { getMorningQuoteText } from "@/lib/morning-quotes";

type QuoteFeedback = "liked" | "disliked" | null;

type SleepLog = {
  sleptAt: string;
  wokeAt: string;
  hours: number;
  minutes: number;
  quality: "Great" | "Okay" | "Poor";
};

type MorningState = {
  quoteIndex?: number;
  quoteFeedback?: QuoteFeedback;
  sleep?: SleepLog;
  sleepCheckCompleted?: boolean;
  [key: string]: unknown;
};

const defaultSleep: SleepLog = {
  sleptAt: "23:15",
  wokeAt: "06:45",
  hours: 7,
  minutes: 30,
  quality: "Okay",
};

function sleepQualityFromRating(rating: number): SleepLog["quality"] {
  if (rating >= 4) return "Great";
  if (rating <= 2) return "Poor";
  return "Okay";
}

export default function MorningPage() {
  const [state, setState] = useState<MorningState>({});
  const [ready, setReady] = useState(false);
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const [sleepRating, setSleepRating] = useState<number | null>(null);

  useEffect(() => {
    async function boot() {
      const user = await requireSignedInUser();
      if (!user) return;

      const saved = localStorage.getItem(storageKey);
      const parsed = saved ? (JSON.parse(saved) as MorningState) : {};
      setState(parsed);
      setReady(true);
    }

    void boot();
  }, []);

  async function savePatch(patch: Partial<MorningState>) {
    const nextState = { ...state, ...patch };
    localStorage.setItem(storageKey, JSON.stringify(nextState));
    setState(nextState);
    await saveHealthStateWithHistory(nextState);
  }

  async function saveFeedback(feedback: Exclude<QuoteFeedback, null>) {
    setFeedbackSaved(true);
    await savePatch({ quoteFeedback: feedback });
  }

  async function saveSleepRating(rating: number) {
    const currentSleep = state.sleep ?? defaultSleep;
    const nextSleep = {
      ...currentSleep,
      quality: sleepQualityFromRating(rating),
    };

    setSleepRating(rating);
    await savePatch({
      sleep: nextSleep,
      sleepCheckCompleted: true,
      morningSleepRating: rating,
    });
  }

  const quote = getMorningQuoteText(state.quoteIndex ?? 0);
  const feedback = state.quoteFeedback ?? null;

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <Card className="max-w-sm text-center">
          <CardHeader>
            <CardTitle>Loading morning check-in</CardTitle>
            <CardDescription>Getting your quote ready.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-3 py-3 sm:px-5 sm:py-5">
      <AppNav title="Morning check-in" />
      <section className="glass-shell mx-auto mt-4 max-w-3xl rounded-lg p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="h-5 w-5 text-amber-600" />
              Your morning quote
            </CardTitle>
            <CardDescription>Start gently, then tell me how you slept.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <blockquote className="border-l-4 border-primary pl-4 text-lg font-semibold leading-8">
              {quote}
            </blockquote>

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant={feedback === "liked" ? "default" : "outline"}
                onClick={() => saveFeedback("liked")}
              >
                <ThumbsUp />
                Like
              </Button>
              <Button
                variant={feedback === "disliked" ? "default" : "outline"}
                onClick={() => saveFeedback("disliked")}
              >
                <ThumbsDown />
                Dislike
              </Button>
            </div>

            {(feedbackSaved || feedback) && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-center font-semibold text-emerald-800">
                <Check className="mr-2 inline h-4 w-4" />
                Thank you for the feedback
              </div>
            )}

            {(feedbackSaved || feedback) && (
              <div className="glass-surface rounded-lg p-4">
                <div className="mb-4 flex items-center gap-2">
                  <Moon className="h-5 w-5 text-indigo-700" />
                  <div>
                    <p className="font-semibold">How was your sleep?</p>
                    <p className="text-sm text-muted-foreground">Rate it from 1 to 5.</p>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <Button
                      key={rating}
                      variant={sleepRating === rating ? "default" : "outline"}
                      onClick={() => saveSleepRating(rating)}
                    >
                      {rating}
                    </Button>
                  ))}
                </div>

                {sleepRating && (
                  <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-center font-semibold text-emerald-800">
                    <Check className="mr-2 inline h-4 w-4" />
                    Sleep rating saved
                  </div>
                )}
              </div>
            )}

            <Button asChild className="w-full">
              <Link href="/">Go to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
