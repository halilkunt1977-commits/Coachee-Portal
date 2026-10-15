"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Field, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { login } from "./actions";

export default function LoginForm({ notice }: { notice?: string }) {
  const [state, action] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-4">
      {notice && <Notice>{notice}</Notice>}
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <Field label="E-Mail" name="email" type="email" autoComplete="username" required autoFocus />
      <Field label="Passwort" name="password" type="password" autoComplete="current-password" required />
      <SubmitButton className="btn w-full">Anmelden</SubmitButton>
      <p className="text-center text-sm"><Link href="/passwort-vergessen" className="link">Passwort vergessen?</Link></p>
    </form>
  );
}
