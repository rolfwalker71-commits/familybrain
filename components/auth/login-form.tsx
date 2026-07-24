"use client";

import { useState } from "react";
import { Brain, Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || "Anmeldung fehlgeschlagen.");
      }
      window.location.assign(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-md border-white/50 bg-white/95 shadow-2xl shadow-slate-950/20 backdrop-blur">
      <CardHeader className="space-y-5 px-6 pb-2 pt-7 sm:px-8">
        <div className="flex items-center gap-4">
          <span className="flex size-14 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <Brain className="size-7" />
          </span>
          <div>
            <p className="text-sm font-medium text-primary">MyBrain</p>
            <CardTitle className="text-2xl">Willkommen zurück</CardTitle>
          </div>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          Melde dich an, um auf deine Dokumente und Auswertungen zuzugreifen.
        </p>
      </CardHeader>
      <CardContent className="px-6 pb-7 pt-5 sm:px-8">
        <form className="space-y-5" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="username">Benutzername</Label>
            <Input
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="h-11 text-base"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Passwort</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 text-base"
              required
            />
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              {error}
            </div>
          ) : null}

          <Button
            type="submit"
            size="lg"
            className="h-11 w-full"
            disabled={loading || !username.trim() || !password}
          >
            {loading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <LockKeyhole />
            )}
            {loading ? "Anmeldung läuft…" : "Anmelden"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
