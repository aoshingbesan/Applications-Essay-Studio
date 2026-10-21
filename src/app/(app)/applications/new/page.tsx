import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/page-header";
import { WizardSteps } from "@/components/applications/wizard-steps";
import { NewApplicationForm } from "./new-application-form";

export const metadata: Metadata = { title: "Create application" };

export default function NewApplicationPage() {
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Create application" description="Four short steps. Your progress is saved after each one, so you can come back later." back={{ href: "/applications", label: "Applications" }} />
      <WizardSteps current={1} />
      <NewApplicationForm />
    </PageContainer>
  );
}
