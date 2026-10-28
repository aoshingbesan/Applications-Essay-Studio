import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { configuredModel, isAiConfigured } from "@/lib/ai/client";
import type { Profile } from "@/lib/domain/types";
import { SettingsForms } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("*").maybeSingle<Profile>();
  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title="Settings" description="Your profile, writing defaults, export defaults, AI and account." />
      <SettingsForms
        email={user.email ?? ""}
        profile={profile ?? { id: user.id, display_name: null, full_name: null, writing_preferences: {}, export_settings: {}, ai_enabled: true }}
        ai={{ configured: isAiConfigured(), models: configuredModel() }}
      />
    </PageContainer>
  );
}
