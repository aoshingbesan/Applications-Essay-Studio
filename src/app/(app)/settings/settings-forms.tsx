"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmAction } from "@/components/confirm-action";
import { PreferencesForm, preferenceDefaults } from "@/components/applications/preferences-form";
import { createClient } from "@/lib/supabase/client";
import type { ExportSettings, Profile } from "@/lib/domain/types";
import { deleteAccount, deleteAllData, setAiEnabled, updateDefaultPreferences, updateExportSettings, updateProfile } from "@/server/account";
import { handleResult } from "@/lib/client/result";

function Card({ id, title, description, children }: { id: string; title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border bg-card p-5 sm:p-6">
      <h2 id={id} className="font-heading text-lg font-semibold">
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ExportDefaults({ initial }: { initial: ExportSettings }) {
  const [s, setS] = useState<Required<ExportSettings>>({ font: initial.font ?? "serif", fontSize: initial.fontSize ?? 12, margins: initial.margins ?? "normal", lineSpacing: initial.lineSpacing ?? 1.5, pageNumbers: initial.pageNumbers ?? true });
  const [busy, setBusy] = useState(false);
  const sel = (id: string, label: string, value: string, onChange: (v: string) => void, opts: [string, string][]) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {opts.map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        {sel("d-font", "Font", s.font, (v) => setS({ ...s, font: v as typeof s.font }), [
          ["serif", "Serif"],
          ["sans", "Sans-serif"],
          ["mono", "Monospace"],
        ])}
        {sel("d-size", "Size", String(s.fontSize), (v) => setS({ ...s, fontSize: Number(v) }), ["10", "11", "12", "13", "14"].map((x) => [x, `${x} pt`]))}
        {sel("d-margins", "Margins", s.margins, (v) => setS({ ...s, margins: v as typeof s.margins }), [
          ["narrow", "Narrow"],
          ["normal", "Normal"],
          ["wide", "Wide"],
        ])}
        {sel("d-spacing", "Line spacing", String(s.lineSpacing), (v) => setS({ ...s, lineSpacing: Number(v) }), [
          ["1", "Single"],
          ["1.15", "1.15"],
          ["1.5", "1.5"],
          ["2", "Double"],
        ])}
      </div>
      <div className="flex items-center gap-2">
        <Switch id="d-pages" checked={s.pageNumbers} onCheckedChange={(v) => setS({ ...s, pageNumbers: v })} />
        <Label htmlFor="d-pages" className="font-normal">
          Page numbers
        </Label>
      </div>
      <Button
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          handleResult(await updateExportSettings(s), "Export defaults saved");
          setBusy(false);
        }}
      >
        Save export defaults
      </Button>
    </div>
  );
}

export function SettingsForms({ email, profile, ai }: { email: string; profile: Profile; ai: { configured: boolean; model: string | null } }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [aiEnabled, setAiEnabledState] = useState(profile.ai_enabled);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <Card id="s-profile" title="Profile">
        <form
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy("profile");
            handleResult(await updateProfile({ display_name: displayName, full_name: fullName }), "Profile saved");
            setBusy(null);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="s-display">Display name</Label>
            <Input id="s-display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-full">Full name</Label>
            <Input id="s-full" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={200} />
          </div>
          <div className="text-sm text-muted-foreground sm:col-span-2">Signed in as {email}. Your reusable evidence lives in the Personal Profile and Story Bank, separately from your drafts.</div>
          <div>
            <Button type="submit" disabled={busy === "profile"}>
              Save profile
            </Button>
          </div>
        </form>
      </Card>

      <Card id="s-writing" title="Default writing preferences" description="Copied into each new application; you can change them per application in its setup.">
        <PreferencesForm initial={preferenceDefaults(profile.writing_preferences)} submitLabel="Save defaults" onSubmit={async (v) => handleResult(await updateDefaultPreferences(v), "Writing defaults saved") !== null} />
      </Card>

      <Card id="s-export" title="Default export settings">
        <ExportDefaults initial={profile.export_settings} />
      </Card>

      <Card
        id="s-ai"
        title="AI and connected services"
        description="AI features use Anthropic's Claude API from the server. When you use one, the relevant essay requirements, the evidence you selected (or the most relevant items), document excerpts and text are sent to Anthropic for processing. Retention is governed by the Anthropic account this deployment is configured with; this app does not log essay text."
      >
        <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Database and storage</dt>
            <dd>Supabase — connected (sign-in shared with Recommendation Letter Studio; Essay Studio data kept separately)</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">AI provider</dt>
            <dd>{ai.configured ? `Anthropic Claude — configured (${ai.model})` : "Not configured (ANTHROPIC_API_KEY missing on the server)"}</dd>
          </div>
        </dl>
        <div className="flex items-center gap-3">
          <Switch
            id="s-ai-enabled"
            checked={aiEnabled}
            onCheckedChange={async (v) => {
              setAiEnabledState(v);
              if (handleResult(await setAiEnabled(v), v ? "AI features turned on" : "AI features turned off — nothing will be sent to the AI provider") === null) setAiEnabledState(!v);
            }}
          />
          <Label htmlFor="s-ai-enabled" className="font-normal">
            Enable AI features for my account
          </Label>
        </div>
      </Card>

      <Card id="s-appearance" title="Appearance">
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="s-theme">Theme</Label>
          <Select value={theme ?? "system"} onValueChange={setTheme}>
            <SelectTrigger id="s-theme" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">Match system</SelectItem>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card id="s-security" title="Account security">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            if (password.length < 8) {
              toast.error("Use at least 8 characters.");
              return;
            }
            setBusy("password");
            const { error } = await createClient().auth.updateUser({ password });
            setBusy(null);
            if (error) toast.error(error.message);
            else {
              toast.success("Password changed");
              setPassword("");
            }
          }}
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="s-password">New password</Label>
            <Input id="s-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} maxLength={128} />
          </div>
          <Button type="submit" variant="outline" disabled={busy === "password"}>
            {busy === "password" && <Loader2 className="animate-spin" />} Change password
          </Button>
        </form>
      </Card>

      <Card id="s-data" title="Your data" description="Download everything you have stored in Essay Studio, or delete it. Deletion removes database records, extracted text, cached analyses and uploaded files.">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href="/api/account/export" download>
              <Download /> Export my data (JSON)
            </a>
          </Button>
          <ConfirmAction
            trigger={<Button variant="destructive">Delete my Essay Studio data</Button>}
            title="Delete all your Essay Studio data?"
            description="Every application, essay, version, review, Story Bank entry, document, exemplar and uploaded file in Essay Studio is permanently deleted. Your account and your Recommendation Letter Studio data are not affected."
            requireText="DELETE"
            onConfirm={async (typed) => {
              if (handleResult(await deleteAllData(typed), "All data deleted") === null) return false;
              router.refresh();
            }}
          />
          <ConfirmAction
            trigger={<Button variant="destructive">Delete my account (both apps)</Button>}
            title="Delete your whole account?"
            description="Your sign-in is shared with Recommendation Letter Studio. Deleting the account permanently removes it and all of your data in both apps. This cannot be undone. To remove only Essay Studio data, use “Delete my Essay Studio data” instead."
            requireText="DELETE"
            confirmLabel="Delete account"
            onConfirm={async (typed) => {
              const res = await deleteAccount(typed);
              if (res && !res.ok) {
                handleResult(res);
                return false;
              }
            }}
          />
        </div>
      </Card>
    </div>
  );
}
