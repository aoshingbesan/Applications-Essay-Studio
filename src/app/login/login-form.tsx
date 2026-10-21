"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Field } from "@/components/form-field";
import { createClient } from "@/lib/supabase/client";

const schema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters").max(128),
});
type Values = z.infer<typeof schema>;

export function LoginForm({ notice, next }: { notice: string | null; next?: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const router = useRouter();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const onSubmit = async (values: Values) => {
    setError(null);
    const supabase = createClient();
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword(values);
      if (error) {
        setError(error.message === "Email not confirmed" ? "Please confirm your email address first." : "Incorrect email or password.");
        return;
      }
      router.replace(target);
      router.refresh();
    } else {
      const { data, error } = await supabase.auth.signUp({
        ...values,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}` },
      });
      if (error) {
        setError(error.message);
        return;
      }
      if (data.session) {
        router.replace(target);
        router.refresh();
      } else {
        setSentTo(values.email);
      }
    }
  };

  if (sentTo) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center">
        <MailCheck className="mx-auto mb-3 size-6" aria-hidden />
        <p className="text-sm">
          We sent a confirmation link to <strong>{sentTo}</strong>. Open it to finish creating your account.
        </p>
        <Button variant="link" className="mt-2" onClick={() => { setSentTo(null); setMode("signin"); }}>
          Back to sign in
        </Button>
      </div>
    );
  }

  const { errors, isSubmitting } = form.formState;
  return (
    <div className="rounded-xl border bg-card p-6 shadow-xs">
      <Tabs value={mode} onValueChange={(v) => { setMode(v as typeof mode); setError(null); }} className="mb-5">
        <TabsList className="w-full">
          <TabsTrigger value="signin" className="flex-1">Sign in</TabsTrigger>
          <TabsTrigger value="signup" className="flex-1">Create account</TabsTrigger>
        </TabsList>
      </Tabs>
      {notice && !error && (
        <Alert className="mb-4">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field id="email" label="Email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register("email")} />
        </Field>
        <Field id="password" label="Password" error={errors.password?.message} hint={mode === "signup" ? "At least 8 characters." : undefined}>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            aria-invalid={!!errors.password}
            {...form.register("password")}
          />
        </Field>
        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          {mode === "signin" ? "Sign in" : "Create account"}
        </Button>
      </form>
    </div>
  );
}
