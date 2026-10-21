import type { Editor } from "@tiptap/react";
import type { EssayDoc } from "@/lib/essay/doc";
import type {
  Application,
  Essay,
  EssayReview,
  EssayVersion,
  EvidenceLink,
  ExportSettings,
  LibraryEntry,
  SelectedLesson,
  SupportingDocument,
} from "@/lib/domain/types";
import type { EssaySummary } from "@/server/queries";
import type { SaveMode } from "@/server/essays";

export type VersionSummary = Omit<EssayVersion, "content" | "plain_text">;

export interface WorkspaceData {
  essay: Essay;
  application: Pick<Application, "id" | "name" | "programme" | "institution" | "selection_criteria" | "official_instructions">;
  siblings: EssaySummary[];
  versions: VersionSummary[];
  checksReview: EssayReview | null;
  aiReview: EssayReview | null;
  entries: Pick<LibraryEntry, "id" | "title" | "section" | "also_in" | "classification" | "privacy" | "period">[];
  /** Relevant "Ask first" entries not yet approved for this essay (ranked locally, never sent to the AI). */
  pendingApprovals: string[];
  documents: Pick<SupportingDocument, "id" | "title" | "doc_type" | "extraction_status">[];
  links: EvidenceLink[];
  lessons: SelectedLesson[];
  exemplars: { id: string; title: string; analysed: boolean }[];
  exemplarTitles: Record<string, string>;
  exportDefaults: ExportSettings;
  authorName: string;
  aiConfigured: boolean;
  aiEnabled: boolean;
}

export interface EditorApi {
  editor: Editor;
  essayId: string;
  getDoc: () => EssayDoc;
  getText: () => string;
  revision: () => number;
  /** Flushes pending autosaves. */
  flush: () => Promise<void>;
  /** Saves the current text now; with a mode, also creates a version. Returns false on failure. */
  saveNow: (mode?: Exclude<SaveMode, { kind: "autosave" }>) => Promise<boolean>;
  /** Replaces the whole document with server-confirmed content (restore, applied AI draft). */
  replaceAll: (doc: EssayDoc, revision: number) => void;
  refresh: () => void;
  aiAvailable: boolean;
  aiUnavailableReason: string | null;
}
