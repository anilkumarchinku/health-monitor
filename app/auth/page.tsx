"use client";

import { FormEvent, useEffect, useState } from "react";
import { LogIn, Mail, UserPlus } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { HealthSyncStatus } from "@/components/sync-status";
import { BrandLogo } from "@/components/brand-logo";
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
import { useToast } from "@/components/ui/toast";
import { restoreAccountDestination } from "@/lib/account-restore";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { signInDestination } from "@/lib/return-path";

export default function AuthPage() {
  const showToast = useToast();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [mailLoading, setMailLoading] = useState(false);
  const [supabase] = useState(createSupabaseBrowserClient);

  useEffect(() => {
    async function checkSession() {
      if (!supabase) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) await continueAfterSignIn(user.id);
    }

    void checkSession().catch(() => setMessage("Could not restore your account. Please try signing in again; your unsynced entries have been kept."));
  }, [supabase]);

  async function continueAfterSignIn(userId: string) {
    window.location.href = await restoreAccountDestination(userId, signInDestination());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!supabase) {
      setMessage("Sign-in is temporarily unavailable. Please try again later.");
      return;
    }

    setLoading(true);
    try {
      const credentials = { email: email.trim(), password };
      const { data, error } =
        mode === "sign-in"
          ? await supabase.auth.signInWithPassword(credentials)
          : await supabase.auth.signUp(credentials);

      if (error) {
        setMessage(error.message);
        return;
      }

      if (mode === "sign-up") {
        setMessage("Account created. Check your email if Supabase asks for confirmation, then sign in.");
        showToast("Account created");
        setMode("sign-in");
        return;
      }

      showToast("Signed in");
      if (data.user) {
        await continueAfterSignIn(data.user.id);
        return;
      }

      window.location.href = `/onboarding?next=${encodeURIComponent(signInDestination())}`;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not sign in. Please retry."); }
    finally { setLoading(false); }
  }

  async function sendMagicLink() {
    setMessage("");
    const trimmedEmail = email.trim();

    if (!supabase) {
      setMessage("Sign-in is temporarily unavailable. Please try again later.");
      return;
    }

    if (!trimmedEmail) {
      setMessage("Enter your email first, then I can send the sign-in link.");
      return;
    }

    setMailLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth?next=${encodeURIComponent(signInDestination())}`,
        },
      });
      if (error) {
        setMessage(error.message);
        return;
      }

      setMessage("Sign-in link sent. Open your email and tap the link to continue.");
      showToast("Magic link sent");
    } catch { setMessage("Could not send the sign-in link. Please retry."); }
    finally { setMailLoading(false); }
  }

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6">
      <AppNav title={mode === "sign-in" ? "Welcome back" : "Create account"} signedIn={false} />
      <section className="glass-shell mx-auto flex min-h-[calc(100vh-40px)] max-w-5xl items-center justify-center rounded-lg p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <BrandLogo className="mb-2" />
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

              {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
              <HealthSyncStatus />

              <Button className="w-full" disabled={loading}>
                {mode === "sign-in" ? <LogIn /> : <UserPlus />}
                {loading ? "Please wait" : mode === "sign-in" ? "Sign in" : "Create account"}
              </Button>
            </form>

            {mode === "sign-in" && (
              <Button
                className="mt-3 w-full"
                type="button"
                variant="secondary"
                disabled={mailLoading || loading}
                onClick={sendMagicLink}
              >
                <Mail />
                {mailLoading ? "Sending link" : "Sign in with email link"}
              </Button>
            )}

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
