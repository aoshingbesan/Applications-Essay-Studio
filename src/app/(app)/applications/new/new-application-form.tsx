"use client";

import { useRouter } from "next/navigation";
import { OpportunityForm, opportunityDefaults } from "@/components/applications/opportunity-form";
import { createApplication } from "@/server/applications";
import { handleResult } from "@/lib/client/result";

export function NewApplicationForm() {
  const router = useRouter();
  return (
    <OpportunityForm
      initial={opportunityDefaults()}
      submitLabel="Save and continue"
      onSubmit={async (values) => {
        const res = handleResult(await createApplication(values));
        if (!res) return false;
        router.push(`/applications/${res.id}/setup?step=2`);
        return true;
      }}
    />
  );
}
