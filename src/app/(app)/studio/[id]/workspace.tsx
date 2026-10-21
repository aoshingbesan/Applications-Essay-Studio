"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Selection } from "@tiptap/pm/state";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  ChevronLeft,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  PanelLeft,
  PanelRight,
  Pilcrow,
  Redo2,
  Save,
  Underline,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SaveIndicator } from "@/components/save-indicator";
import { ExportDialog } from "@/components/export-dialog";
import { useAutosave } from "@/hooks/use-autosave";
import { asDoc, countWords, docHeadings, docToPlainText, type EssayDoc } from "@/lib/essay/doc";
import { wordLimitStatus } from "@/lib/essay/word-limit";
import { ESSAY_STATUSES, ESSAY_STATUS_LABELS, type EssayStatus } from "@/lib/domain/constants";
import { saveEssay, type SaveMode } from "@/server/essays";
import { setEssayStatus } from "@/server/applications";
import { handleResult } from "@/lib/client/result";
import { cn } from "@/lib/utils";
import { HighlightRange, focusBlock } from "./editor-utils";
import type { EditorApi, WorkspaceData } from "./types";
import { LeftPanel } from "./panels/left-panel";
import { RightPanel } from "./panels/right-panel";
import { VersionMenu } from "./panels/version-menu";

/**
 * Replaces the whole document. setContent leaves the entire document selected, so the cursor is
 * collapsed afterwards — otherwise the next keystroke would replace the whole essay.
 */
function replaceDocument(editor: Editor, doc: EssayDoc) {
  editor.commands.setContent(doc, { emitUpdate: false });
  editor.view.dispatch(editor.state.tr.setSelection(Selection.atStart(editor.state.doc)));
}

const EDITOR_EXTENSIONS = [
  StarterKit.configure({ code: false, codeBlock: false, link: false, heading: { levels: [2, 3] } }),
  Placeholder.configure({ placeholder: "Start writing, or generate an outline and draft from the Workflow panel…" }),
  HighlightRange,
];

function useIsDesktop() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(min-width: 1024px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => true,
  );
}

function ToolbarButton({ label, onClick, active, disabled, children }: { label: string; onClick: () => void; active?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={active} className={cn(active && "bg-muted text-foreground")}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      paragraph: e.isActive("paragraph"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const c = () => editor.chain().focus();
  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5">
      <ToolbarButton label="Undo (⌘Z)" onClick={() => c().undo().run()} disabled={!s.canUndo}>
        <Undo2 />
      </ToolbarButton>
      <ToolbarButton label="Redo (⇧⌘Z)" onClick={() => c().redo().run()} disabled={!s.canRedo}>
        <Redo2 />
      </ToolbarButton>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <ToolbarButton label="Bold (⌘B)" onClick={() => c().toggleBold().run()} active={s.bold}>
        <Bold />
      </ToolbarButton>
      <ToolbarButton label="Italic (⌘I)" onClick={() => c().toggleItalic().run()} active={s.italic}>
        <Italic />
      </ToolbarButton>
      <ToolbarButton label="Underline (⌘U)" onClick={() => c().toggleUnderline().run()} active={s.underline}>
        <Underline />
      </ToolbarButton>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <ToolbarButton label="Paragraph" onClick={() => c().setParagraph().run()} active={s.paragraph}>
        <Pilcrow />
      </ToolbarButton>
      <ToolbarButton label="Heading" onClick={() => c().toggleHeading({ level: 2 }).run()} active={s.h2}>
        <Heading2 />
      </ToolbarButton>
      <ToolbarButton label="Subheading" onClick={() => c().toggleHeading({ level: 3 }).run()} active={s.h3}>
        <Heading3 />
      </ToolbarButton>
      <ToolbarButton label="Bulleted list" onClick={() => c().toggleBulletList().run()} active={s.bullet}>
        <List />
      </ToolbarButton>
      <ToolbarButton label="Numbered list" onClick={() => c().toggleOrderedList().run()} active={s.ordered}>
        <ListOrdered />
      </ToolbarButton>
    </div>
  );
}

function WordMeter({ words, min, max }: { words: number; min: number | null; max: number | null }) {
  const status = wordLimitStatus(words, min, max);
  const tone = status.state === "over" ? "bg-destructive" : status.state === "under" && min !== null && words < min ? "bg-warning" : status.state === "near" ? "bg-warning" : "bg-ink";
  return (
    <div className="flex items-center gap-2" aria-live="polite">
      {max !== null && (
        <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
          <span className={cn("block h-full rounded-full transition-[width]", tone)} style={{ width: `${Math.min(100, status.percent ?? 0)}%` }} />
        </span>
      )}
      <span className={cn("text-xs whitespace-nowrap tabular-nums", status.state === "over" ? "font-medium text-destructive" : "text-muted-foreground")} title={status.message}>
        {words.toLocaleString()}
        {max !== null ? ` / ${max.toLocaleString()}` : ""} words
      </span>
    </div>
  );
}

export function Workspace({ data }: { data: WorkspaceData }) {
  const router = useRouter();
  const desktop = useIsDesktop();
  const { essay } = data;
  const revisionRef = useRef(essay.revision);
  const conflictRef = useRef(false);
  const [conflict, setConflictState] = useState(false);
  const [words, setWords] = useState(essay.word_count);
  const [headings, setHeadings] = useState(() => docHeadings(essay.content));
  const [status, setStatus] = useState<EssayStatus>(essay.status);
  // Follow server-side status changes (e.g. the first saved text moves it to In Progress).
  const [serverStatus, setServerStatus] = useState(essay.status);
  if (essay.status !== serverStatus) {
    setServerStatus(essay.status);
    setStatus(essay.status);
  }
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [sheet, setSheet] = useState<"left" | "right" | null>(null);
  const [versionOpen, setVersionOpen] = useState(false);
  const [versionTitle, setVersionTitle] = useState("");
  const [versionSummary, setVersionSummary] = useState("");

  const setConflict = (v: boolean) => {
    conflictRef.current = v;
    setConflictState(v);
  };

  // Every write goes through one queue: autosave, manual versions and AI edits never overlap, and
  // each request reads the revision only when it runs, so the client never conflicts with itself.
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const persist = useCallback(
    (doc: EssayDoc, mode: SaveMode): Promise<boolean> => {
      const run = saveChain.current.then(async () => {
        if (conflictRef.current) return false;
        const res = await saveEssay(essay.id, doc, revisionRef.current, mode);
        if (!res.ok) {
          if (res.code === "conflict") setConflict(true);
          else handleResult(res);
          return false;
        }
        revisionRef.current = res.data.revision;
        return true;
      });
      saveChain.current = run.catch(() => false);
      return run;
    },
    [essay.id],
  );

  const autosave = useAutosave<EssayDoc>((doc) => persist(doc, { kind: "autosave" }), 1500);

  // The latest document. TipTap builds a recreated editor instance from the `content` option, so
  // it must always be the current text, never the content the page was first loaded with.
  const [latestDoc, setLatestDoc] = useState<EssayDoc>(essay.content);
  // The same document, updated synchronously (state lags a render behind).
  const docRef = useRef<EssayDoc>(essay.content);
  const [editorProps] = useState(() => ({
    attributes: { class: "focus:outline-none", role: "textbox", "aria-multiline": "true", "aria-label": `${essay.title} — essay text`, spellcheck: "true" },
  }));
  const editor = useEditor({
    immediatelyRender: false,
    extensions: EDITOR_EXTENSIONS,
    content: latestDoc,
    editorProps,
    onUpdate: ({ editor: e }) => {
      const doc = asDoc(e.getJSON());
      docRef.current = doc;
      setLatestDoc(doc);
      setWords(countWords(docToPlainText(doc)));
      setHeadings(docHeadings(doc));
      if (!conflictRef.current) autosave.schedule(doc);
    },
  });

  // If TipTap ever recreates its editor instance (it builds from the last-rendered `content`
  // option, which can be a render behind), restore the authoritative document.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const current = asDoc(editor.getJSON());
    if (JSON.stringify(current) !== JSON.stringify(docRef.current)) replaceDocument(editor, docRef.current);
  }, [editor]);

  // ⌘S / Ctrl+S saves a named version.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setVersionOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!editor) return <div className="p-10 text-sm text-muted-foreground">Loading the editor…</div>;

  const aiUnavailableReason = !data.aiConfigured
    ? "AI is not configured on this server (ANTHROPIC_API_KEY is missing). Writing, checks and export still work."
    : !data.aiEnabled
      ? "AI features are switched off in Settings."
      : null;

  const api: EditorApi = {
    editor,
    essayId: essay.id,
    getDoc: () => asDoc(editor.getJSON()),
    getText: () => docToPlainText(asDoc(editor.getJSON())),
    revision: () => revisionRef.current,
    flush: async () => {
      await autosave.flush();
      await saveChain.current;
    },
    saveNow: async (mode) => {
      await autosave.flush();
      if (conflictRef.current) return false;
      const ok = await persist(asDoc(editor.getJSON()), mode ?? { kind: "autosave" });
      if (ok && mode) router.refresh();
      return ok;
    },
    replaceAll: (doc, revision) => {
      revisionRef.current = revision;
      docRef.current = doc;
      setLatestDoc(doc);
      replaceDocument(editor, doc);
      setWords(countWords(docToPlainText(doc)));
      setHeadings(docHeadings(doc));
      router.refresh();
    },
    refresh: () => router.refresh(),
    aiAvailable: aiUnavailableReason === null,
    aiUnavailableReason,
  };

  const saveVersion = async () => {
    const ok = await api.saveNow({ kind: "manual", title: versionTitle.trim() || undefined, summary: versionSummary.trim() || undefined });
    if (ok) {
      toast.success("Version saved");
      setVersionTitle("");
      setVersionSummary("");
      setVersionOpen(false);
    }
  };

  const left = <LeftPanel data={data} api={api} headings={headings} onNavigate={() => setSheet(null)} />;
  const right = <RightPanel data={data} api={api} status={status} onStatus={setStatus} />;
  const showLeft = desktop ? leftOpen : sheet === "left";
  const showRight = desktop ? rightOpen : sheet === "right";

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col lg:h-dvh">
      <header className="border-b bg-background">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 sm:px-4">
          <Button variant="ghost" size="icon-sm" onClick={() => (desktop ? setLeftOpen((o) => !o) : setSheet("left"))} aria-label={showLeft ? "Hide left panel" : "Show left panel"} aria-pressed={showLeft}>
            <PanelLeft />
          </Button>
          <Link href={`/applications/${data.application.id}`} className="inline-flex min-w-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4 shrink-0" aria-hidden />
            <span className="max-w-[14rem] truncate">{data.application.programme || data.application.name}</span>
          </Link>
          <Select
            value={status}
            onValueChange={async (v) => {
              const prev = status;
              setStatus(v as EssayStatus);
              if (handleResult(await setEssayStatus(essay.id, v as EssayStatus), "Status updated") === null) setStatus(prev);
            }}
          >
            <SelectTrigger size="sm" className="w-40" aria-label="Essay status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ESSAY_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {ESSAY_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-1.5">
            <SaveIndicator state={autosave.state} lastSavedAt={autosave.lastSavedAt} onRetry={() => void autosave.flush()} />
            <VersionMenu api={api} versions={data.versions} />
            <Popover open={versionOpen} onOpenChange={setVersionOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" disabled={conflict}>
                  <Save /> <span className="hidden sm:inline">Save version</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveVersion();
                  }}
                >
                  <Label htmlFor="version-title">Draft name (optional)</Label>
                  <Input id="version-title" value={versionTitle} onChange={(e) => setVersionTitle(e.target.value)} placeholder="e.g. After tutor feedback" maxLength={200} autoFocus />
                  <Label htmlFor="version-summary">What changed (optional)</Label>
                  <Input id="version-summary" value={versionSummary} onChange={(e) => setVersionSummary(e.target.value)} maxLength={500} />
                  <Button type="submit" size="sm" className="w-full">
                    Save version
                  </Button>
                </form>
              </PopoverContent>
            </Popover>
            <ExportDialog
              essays={[{ id: essay.id, title: essay.title }]}
              defaultTitle={essay.title}
              defaults={data.exportDefaults}
              beforeExport={async () => {
                const ok = await api.saveNow();
                if (!ok) toast.error("Save the essay before exporting.");
                return ok;
              }}
              trigger={<Button size="sm">Export</Button>}
            />
            <Button variant="ghost" size="icon-sm" onClick={() => (desktop ? setRightOpen((o) => !o) : setSheet("right"))} aria-label={showRight ? "Hide assistant panel" : "Show assistant panel"} aria-pressed={showRight}>
              <PanelRight />
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t px-2 py-1 sm:px-4">
          <Toolbar editor={editor} />
          <WordMeter words={words} min={essay.min_words} max={essay.max_words} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {desktop && leftOpen && <aside className="w-72 shrink-0 overflow-y-auto border-r bg-sidebar xl:w-80">{left}</aside>}

        <div className="min-w-0 flex-1 overflow-y-auto bg-muted/30 px-3 py-6 sm:px-8 sm:py-10">
          {conflict && (
            <Alert variant="destructive" className="mx-auto mb-4 max-w-(--container-prose)">
              <AlertTitle>This essay was changed in another window</AlertTitle>
              <AlertDescription>
                Autosave is paused so neither copy is overwritten. Copy your text if you need it, then reload to get the latest version.
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(api.getText()).then(() => toast.success("Copied"))}>
                    Copy my text
                  </Button>
                  <Button size="sm" onClick={() => window.location.reload()}>
                    Reload
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
          <div className="mx-auto max-w-(--container-prose)">
            <div className="mb-4">
              <h1 className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">{essay.title}</h1>
              {headings.length > 0 && (
                <nav aria-label="Sections" className="mt-2 flex flex-wrap gap-1">
                  {headings.map((h) => (
                    <button key={h.index} type="button" onClick={() => focusBlock(editor, h.index)} className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                      {h.text || "Untitled section"}
                    </button>
                  ))}
                </nav>
              )}
            </div>
            <article className="min-h-[60vh] rounded-sm border bg-paper px-6 py-10 shadow-xs sm:px-10 sm:py-12 2xl:px-14">
              <div className="essay-prose">
                <EditorContent editor={editor} />
              </div>
            </article>
          </div>
        </div>

        {desktop && rightOpen && <aside className="w-[24rem] shrink-0 overflow-hidden border-l bg-background xl:w-[27rem]">{right}</aside>}
      </div>

      {!desktop && (
        <Sheet open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
          <SheetContent side={sheet === "left" ? "left" : "right"} className="w-[92vw] max-w-md overflow-y-auto p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>{sheet === "left" ? "Essay navigation" : "Writing assistant"}</SheetTitle>
            </SheetHeader>
            {sheet === "left" ? left : sheet === "right" ? right : null}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
