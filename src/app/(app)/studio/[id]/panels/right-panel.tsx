"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EssayStatus } from "@/lib/domain/constants";
import type { EditorApi, WorkspaceData } from "../types";
import { WorkflowPanel } from "./workflow-panel";
import { AssistPanel } from "./assist-panel";
import { EvidencePanel } from "./evidence-panel";
import { ExemplarsPanel } from "./exemplars-panel";
import { ReviewPanel } from "./review-panel";

const TABS = [
  ["workflow", "Workflow"],
  ["assist", "Assist"],
  ["evidence", "Evidence"],
  ["exemplars", "Exemplars"],
  ["review", "Review"],
] as const;

export function RightPanel({ data, api, status, onStatus }: { data: WorkspaceData; api: EditorApi; status: EssayStatus; onStatus: (s: EssayStatus) => void }) {
  const [tab, setTab] = useState<string>(data.essay.word_count > 0 ? "assist" : "workflow");
  return (
    <Tabs value={tab} onValueChange={setTab} className="flex h-full min-h-0 flex-col gap-0">
      <TabsList className="m-3 mb-0 grid w-auto grid-cols-5">
        {TABS.map(([v, l]) => (
          <TabsTrigger key={v} value={v} className="px-1 text-xs">
            {l}
          </TabsTrigger>
        ))}
      </TabsList>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Panels stay mounted so in-progress AI results survive switching tabs. */}
        <TabsContent value="workflow" forceMount hidden={tab !== "workflow"} className="p-4">
          <WorkflowPanel data={data} api={api} goTo={setTab} />
        </TabsContent>
        <TabsContent value="assist" forceMount hidden={tab !== "assist"} className="p-4">
          <AssistPanel data={data} api={api} />
        </TabsContent>
        <TabsContent value="evidence" forceMount hidden={tab !== "evidence"} className="p-4">
          <EvidencePanel data={data} api={api} />
        </TabsContent>
        <TabsContent value="exemplars" forceMount hidden={tab !== "exemplars"} className="p-4">
          <ExemplarsPanel data={data} api={api} />
        </TabsContent>
        <TabsContent value="review" forceMount hidden={tab !== "review"} className="p-4">
          <ReviewPanel data={data} api={api} status={status} onStatus={onStatus} />
        </TabsContent>
      </div>
    </Tabs>
  );
}
