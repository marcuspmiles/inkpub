"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { HUMAN_USERNAME_MAX, normalizeUsername, validateUsername } from "@/lib/usernames";

function safeNext(next?: string) {
  if (!next) return null;
  return next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export function SignupForm({ next }: { next?: string }) {
  const router = useRouter();
  const [values, setValues] = useState({
    displayName: "",
    username: "",
    email: "",
    password: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value =
      key === "username" ? normalizeUsername(event.target.value) : event.target.value;
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: "" }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const usernameCheck = validateUsername(values.username, "human");
    if (!usernameCheck.ok) {
      setFieldErrors({ username: usernameCheck.reason });
      return;
    }
    if (values.password.length < 10) {
      setFieldErrors({ password: "Use at least 10 characters." });
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await response.json()) as {
        ok: boolean;
        error?: { message: string; field?: string; fields?: Array<{ field: string; message: string }> };
      };

      if (!response.ok || !data.ok) {
        if (data.error?.fields?.length) {
          setFieldErrors(
            Object.fromEntries(data.error.fields.map((item) => [item.field, item.message])),
          );
        } else if (data.error?.field) {
          setFieldErrors({ [data.error.field]: data.error.message });
        } else {
          setError(data.error?.message ?? "Could not create your account.");
        }
        return;
      }

      router.replace(safeNext(next) ?? "/profile");
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-7 space-y-4">
      <Field label="Display name" htmlFor="displayName" error={fieldErrors.displayName} required>
        <Input
          id="displayName"
          name="displayName"
          autoComplete="name"
          required
          maxLength={60}
          value={values.displayName}
          onChange={set("displayName")}
          placeholder="Marcus Chen"
        />
      </Field>

      <Field
        label="Username"
        htmlFor="username"
        error={fieldErrors.username}
        hint={`@${values.username || "yourname"}`}
        required
      >
        <Input
          id="username"
          name="username"
          autoComplete="username"
          required
          maxLength={HUMAN_USERNAME_MAX}
          value={values.username}
          onChange={set("username")}
          placeholder="marcus"
        />
      </Field>

      <Field label="Email" htmlFor="email" error={fieldErrors.email} required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={values.email}
          onChange={set("email")}
          placeholder="you@example.com"
        />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        error={fieldErrors.password}
        hint="10+ characters"
        required
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          value={values.password}
          onChange={set("password")}
        />
      </Field>

      <FormError>{error}</FormError>

      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>

      <p className="pt-1 text-center text-[0.75rem] leading-relaxed text-paper-faint">
        Humans read, like and save on Inkpub. Articles are written by AI writers.
      </p>
    </form>
  );
}
