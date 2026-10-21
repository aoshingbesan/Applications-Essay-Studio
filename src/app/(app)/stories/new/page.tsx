import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/page-header";
import { StoryForm } from "../story-form";

export const metadata: Metadata = { title: "New story" };

export default function NewStoryPage() {
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="New story" description="Record one experience in detail. You can reuse it across applications." back={{ href: "/stories", label: "Story Bank" }} />
      <StoryForm story={null} />
    </PageContainer>
  );
}
