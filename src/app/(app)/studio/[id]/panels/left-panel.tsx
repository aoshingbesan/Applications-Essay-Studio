"use client";

import Link from "next/link";
import { ChevronRight, ExternalLink, Plus } from "lucide-react";
import { StatusBadge, Pill } from "@/components/badges";
import { ESSAY_TYPE_LABELS } from "@/lib/domain/constants";
import { splitItems } from "@/lib/text/keywords";
import { cn } from "@/lib/utils";
import type { EditorApi, WorkspaceData } from "../types";
import { focusBlock } from "../editor-utils";
import { HistoryPanel } from "./history-panel";

function Section({ title, count, defaultOpen = true, children }: { title: string; count?: number; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details open={defaultOpen} className="group border-b">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
        {title}
        {count !== undefined && <span className="font-normal">({count})</span>}
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

export function LeftPanel({ data, api, headings, onNavigate }: { data: WorkspaceData; api: EditorApi; headings: { index: number; text: string }[]; onNavigate?: () => void }) {
  const { essay } = data;
  const linkedStories = data.stories.filter((s) => data.links.some((l) => l.story_id === s.id));
  const linkedEvidence = data.evidence.filter((e) => data.links.some((l) => l.evidence_id === e.id));
  const linkedDocs = data.documents.filter((d) => data.links.some((l) => l.document_id === d.id));
  const criteria = splitItems([essay.selection_criteria, data.application.selection_criteria].filter(Boolean).join("\n"));

  return (
    <nav aria-label="Essay navigation" className="text-sm">
      <div className="border-b px-4 py-3">
        <div className="text-xs text-muted-foreground">{data.application.institution}</div>
        <Link href={`/applications/${data.application.id}`} className="font-medium hover:underline" onClick={onNavigate}>
          {data.application.programme || data.application.name}
        </Link>
      </div>

      <Section title="Essays" count={data.siblings.length}>
        <ul className="space-y-0.5">
          {data.siblings.map((s) => (
            <li key={s.id}>
              <Link
                href={`/studio/${s.id}`}
                onClick={onNavigate}
                aria-current={s.id === essay.id ? "page" : undefined}
                className={cn("flex items-center justify-between gap-2 rounded-md px-2 py-1.5", s.id === essay.id ? "bg-sidebar-accent font-medium" : "hover:bg-sidebar-accent/60")}
              >
                <span className="truncate">{s.title}</span>
                <StatusBadge status={s.status} className="shrink-0 scale-90" />
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Requirements">
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            {ESSAY_TYPE_LABELS[essay.essay_type]}
            {essay.min_words ? ` · min ${essay.min_words}` : ""}
            {essay.max_words ? ` · max ${essay.max_words} words` : " · no word limit set"}
          </div>
          {essay.prompt ? (
            <blockquote className="border-l-2 border-ink/40 pl-3 font-serif text-[0.92rem] leading-relaxed">{essay.prompt}</blockquote>
          ) : (
            <p className="text-warning">No prompt recorded. Add the exact prompt to get useful guidance.</p>
          )}
          {essay.required_themes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {essay.required_themes.map((t) => (
                <Pill key={t}>{t}</Pill>
              ))}
            </div>
          )}
          {criteria.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium">Selection criteria</div>
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                {criteria.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {[essay.required_format, essay.restrictions, essay.instructions].some(Boolean) && (
            <div className="space-y-1 text-xs text-muted-foreground">
              {essay.required_format && <p>Format: {essay.required_format}</p>}
              {essay.restrictions && <p>Restrictions: {essay.restrictions}</p>}
              {essay.instructions && <p className="whitespace-pre-line">{essay.instructions}</p>}
            </div>
          )}
          <Link href={`/applications/${data.application.id}`} className="inline-flex items-center gap-1 text-xs text-ink hover:underline" onClick={onNavigate}>
            Edit requirements <ExternalLink className="size-3" aria-hidden />
          </Link>
        </div>
      </Section>

      {headings.length > 0 && (
        <Section title="Sections" count={headings.length}>
          <ul className="space-y-0.5">
            {headings.map((h) => (
              <li key={h.index}>
                <button type="button" className="w-full truncate rounded px-2 py-1 text-left hover:bg-sidebar-accent/60" onClick={() => focusBlock(api.editor, h.index)}>
                  {h.text || "Untitled section"}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Story Bank" count={linkedStories.length + linkedEvidence.length} defaultOpen={false}>
        {linkedStories.length + linkedEvidence.length === 0 ? (
          <p className="text-xs text-muted-foreground">No evidence selected — drafts will use the most relevant items automatically. Choose evidence in the Evidence tab.</p>
        ) : (
          <ul className="space-y-1">
            {linkedStories.map((s) => (
              <li key={s.id}>
                <Link href={`/stories/${s.id}`} className="hover:underline" onClick={onNavigate}>
                  {s.title}
                </Link>
              </li>
            ))}
            {linkedEvidence.map((e) => (
              <li key={e.id} className="text-muted-foreground">
                {e.title}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Supporting documents" count={linkedDocs.length} defaultOpen={false}>
        {linkedDocs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No documents linked to this essay.</p>
        ) : (
          <ul className="space-y-1">
            {linkedDocs.map((d) => (
              <li key={d.id}>{d.title}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Exemplar references" count={data.lessons.length} defaultOpen={false}>
        {data.lessons.length === 0 ? (
          <p className="text-xs text-muted-foreground">No writing lessons selected. Exemplar guidance is optional.</p>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {data.lessons.map((l) => (
              <li key={l.id} className="text-muted-foreground">
                <span className="font-medium text-foreground capitalize">{l.aspect === "lesson" ? "Lesson" : l.aspect}:</span> {l.content}
              </li>
            ))}
          </ul>
        )}
        <Link href="/exemplars" className="mt-2 inline-flex items-center gap-1 text-xs text-ink hover:underline" onClick={onNavigate}>
          <Plus className="size-3" aria-hidden /> Add writing reference
        </Link>
      </Section>

      <Section title="Draft history" count={data.versions.length}>
        <HistoryPanel api={api} versions={data.versions} />
      </Section>
    </nav>
  );
}
