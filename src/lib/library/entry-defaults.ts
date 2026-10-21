import type { EntryInput } from "@/lib/domain/schemas";
import type { LibraryEntry } from "@/lib/domain/types";
import { isFutureSection, type EntrySection, type Privacy } from "./sections";

/** Form values for an entry; new entries take the section's privacy default (and goal classification for goals). */
export function entryDefaults(e: LibraryEntry | null, section: EntrySection, privacy: Privacy, prompt?: string): EntryInput {
  const s = (v: string | null | undefined) => v ?? "";
  return {
    section: e?.section ?? section,
    also_in: e?.also_in ?? [],
    title: s(e?.title),
    summary: s(e?.summary),
    organisation: s(e?.organisation),
    role: s(e?.role),
    location: s(e?.location),
    period: s(e?.period),
    figures: s(e?.figures),
    links: s(e?.links),
    context: s(e?.context),
    challenge: s(e?.challenge),
    actions: s(e?.actions),
    outcome: s(e?.outcome),
    measurable_impact: s(e?.measurable_impact),
    lessons: s(e?.lessons),
    motivation: s(e?.motivation),
    narrative: e ? s(e.narrative) : prompt ? `${prompt}\n` : "",
    skills: e?.skills ?? [],
    related_criteria: e?.related_criteria ?? [],
    tags: e?.tags ?? [],
    classification: e?.classification ?? (isFutureSection(section) ? "goal_aspiration" : "verified_fact"),
    source: s(e?.source),
    privacy: e?.privacy ?? privacy,
  };
}
