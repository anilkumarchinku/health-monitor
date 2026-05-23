"use client";

import { FormEvent, useEffect, useState } from "react";
import { Heart, LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AuthPage() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    async function checkSession() {
      if (!supabase) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) window.location.href = "/";
    }

    void checkSession();
  }, [supabase]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!supabase) {
      setMessage("Supabase keys are missing. Add them to .env.local first.");
      return;
    }

    setLoading(true);
    const credentials = { email: email.trim(), password };
    const { error } =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (mode === "sign-up") {
      setMessage("Account created. Check your email if Supabase asks for confirmation, then sign in.");
      setMode("sign-in");
      return;
    }

    window.location.href = "/";
  }

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6">
      <section className="glass-shell mx-auto flex min-h-[calc(100vh-40px)] max-w-5xl items-center justify-center rounded-lg p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-md bg-zinc-950 text-white">
              <Heart className="h-5 w-5" />
            </div>
            <CardTitle>{mode === "sign-in" ? "Welcome back" : "Create your account"}</CardTitle>
            <CardDescription>
              Sign in so meals, water, sleep, images, and reminders belong to your user account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  autoComplete="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                  minLength={6}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>

              {message && <p className="text-sm text-muted-foreground">{message}</p>}

              <Button className="w-full" disabled={loading}>
                {mode === "sign-in" ? <LogIn /> : <UserPlus />}
                {loading ? "Please wait" : mode === "sign-in" ? "Sign in" : "Create account"}
              </Button>
            </form>

            <Button
              className="mt-3 w-full"
              type="button"
              variant="outline"
              onClick={() => {
                setMessage("");
                setMode((current) => (current === "sign-in" ? "sign-up" : "sign-in"));
              }}
            >
              {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </Button>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
