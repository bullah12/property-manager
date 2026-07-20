"use client";

import { Building } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("confirmation") === "failed") {
      setError("That confirmation link is invalid or has expired. Please sign up again.");
    }
  }, []);

  function changeMode(nextMode: "login" | "signup") {
    setMode(nextMode);
    setError(null);
    setSuccess(null);
    setPassword("");
    setConfirmPassword("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(
        mode === "signup" ? "/api/v1/auth/signup" : "/api/v1/auth/login",
        {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            mode === "signup" ? { displayName, email, password } : { email, password }
          ),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? (mode === "signup" ? "Sign up failed" : "Login failed"));
        return;
      }
      const body = await res.json();
      if (mode === "signup" && body?.data?.needsEmailConfirmation) {
        setSuccess("Account created. Check your email to confirm your address, then sign in.");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Building className="size-5" />
          </div>
          <CardTitle>Property Manager</CardTitle>
          <CardDescription>
            {mode === "signup" ? "Create your private portfolio" : "Sign in to your dashboard"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4">
              <p className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                {success}
              </p>
              <Button type="button" className="w-full" onClick={() => changeMode("login")}>
                Back to sign in
              </Button>
            </div>
          ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {mode === "signup" ? (
              <div className="space-y-2">
                <Label htmlFor="display-name">Your name</Label>
                <Input
                  id="display-name"
                  type="text"
                  autoComplete="name"
                  minLength={2}
                  maxLength={200}
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                minLength={mode === "signup" ? 8 : undefined}
                maxLength={128}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {mode === "signup" ? (
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting
                ? mode === "signup"
                  ? "Creating account…"
                  : "Signing in…"
                : mode === "signup"
                  ? "Create account"
                  : "Sign in"}
            </Button>
            <div className="text-center text-sm text-muted-foreground">
              {mode === "signup" ? "Already have an account?" : "New to Property Manager?"}{" "}
              <button
                type="button"
                className="font-medium text-foreground underline underline-offset-4"
                onClick={() => changeMode(mode === "signup" ? "login" : "signup")}
              >
                {mode === "signup" ? "Sign in" : "Create an account"}
              </button>
            </div>
          </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
