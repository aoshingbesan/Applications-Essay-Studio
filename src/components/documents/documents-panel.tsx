"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, Eye, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { ExtractionBadge } from "@/components/badges";
import { FileUpload, OpenFileButton } from "@/components/file-upload";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/domain/constants";
import type { SupportingDocument } from "@/lib/domain/types";
import { createTextDocument, deleteDocument, registerDocument, updateDocument } from "@/server/documents";
import { handleResult } from "@/lib/client/result";
import { formatDate } from "@/lib/format/date";

function TypeSelect({ id, value, onChange }: { id: string; value: DocumentType; onChange: (v: DocumentType) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as DocumentType)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DOCUMENT_TYPES.map((t) => (
          <SelectItem key={t} value={t}>
            {DOCUMENT_TYPE_LABELS[t]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AddDocumentDialog({ applicationId }: { applicationId: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<DocumentType>("cv");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const reset = () => {
    setTitle("");
    setText("");
    setMode("upload");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <FileText /> Add document
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a supporting document</DialogTitle>
          <DialogDescription>PDF, Word (.docx) or text, up to 10 MB. Files are stored privately; the text is extracted so you can check it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="doc-title">Title</Label>
              <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. CV — October 2026" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-type">Type</Label>
              <TypeSelect id="doc-type" value={type} onChange={setType} />
            </div>
          </div>
          {mode === "upload" ? (
            <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-4">
              <FileUpload
                folder="documents"
                label="Choose file and upload"
                onUploaded={async (f) => {
                  const res = handleResult(
                    await registerDocument({ path: f.path, fileName: f.name, title: title.trim() || f.name.replace(/\.[^.]+$/, ""), doc_type: type, application_id: applicationId, notes: "" }),
                  );
                  if (!res) return;
                  if (res.status === "extracted") toast.success("Document added and text extracted");
                  else toast.warning("Document added, but its text could not be read", { description: res.message ?? undefined, duration: 12000 });
                  setOpen(false);
                  reset();
                  router.refresh();
                }}
              />
              <Button variant="link" className="h-auto p-0 text-xs" onClick={() => setMode("paste")}>
                <ClipboardPaste className="size-3.5" /> Paste text instead
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="doc-text">Document text</Label>
              <Textarea id="doc-text" rows={10} value={text} onChange={(e) => setText(e.target.value)} />
              <Button variant="link" className="h-auto p-0 text-xs" onClick={() => setMode("upload")}>
                Upload a file instead
              </Button>
            </div>
          )}
        </div>
        {mode === "paste" && (
          <DialogFooter>
            <Button
              disabled={busy || !title.trim() || !text.trim()}
              onClick={async () => {
                setBusy(true);
                const res = handleResult(await createTextDocument({ title: title.trim(), doc_type: type, application_id: applicationId, notes: "", text }), "Document added");
                setBusy(false);
                if (!res) return;
                setOpen(false);
                reset();
                router.refresh();
              }}
            >
              Save document
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DocumentTextDialog({ doc }: { doc: SupportingDocument }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(doc.extracted_text ?? "");
  const [title, setTitle] = useState(doc.title);
  const [type, setType] = useState<DocumentType>(doc.doc_type);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setText(doc.extracted_text ?? "");
          setTitle(doc.title);
          setType(doc.doc_type);
          setEditing(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Eye /> {doc.extracted_text ? "Inspect text" : "Details"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{doc.title}</DialogTitle>
          <DialogDescription>
            {DOCUMENT_TYPE_LABELS[doc.doc_type]}
            {doc.page_count ? ` · ${doc.page_count} page${doc.page_count === 1 ? "" : "s"}` : ""} · {doc.word_count.toLocaleString()} words extracted. Only excerpts of documents you link to an essay are sent to the AI.
          </DialogDescription>
        </DialogHeader>
        {doc.extraction_error && (
          <Alert>
            <AlertDescription>{doc.extraction_error}</AlertDescription>
          </Alert>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`t-${doc.id}`}>Title</Label>
            <Input id={`t-${doc.id}`} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`ty-${doc.id}`}>Type</Label>
            <TypeSelect id={`ty-${doc.id}`} value={type} onChange={setType} />
          </div>
        </div>
        {editing || !doc.extracted_text ? (
          <div className="space-y-1.5">
            <Label htmlFor={`x-${doc.id}`}>{doc.extracted_text ? "Corrected text" : "Paste the document's text"}</Label>
            <Textarea id={`x-${doc.id}`} rows={14} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        ) : (
          <pre className="max-h-[50vh] overflow-y-auto rounded-lg border bg-muted/40 p-4 font-serif text-sm whitespace-pre-wrap">{doc.extracted_text}</pre>
        )}
        <DialogFooter className="gap-2">
          {doc.extracted_text && !editing && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              Correct the text
            </Button>
          )}
          <Button
            onClick={async () => {
              const changedText = editing || !doc.extracted_text ? text : undefined;
              const ok = handleResult(await updateDocument(doc.id, { title, doc_type: type, application_id: doc.application_id, notes: doc.notes ?? "", text: changedText }), "Saved");
              if (ok === undefined) {
                setOpen(false);
                router.refresh();
              }
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DocumentsPanel({
  documents,
  applicationId,
  applicationNames,
  emptyText = "Upload CVs, transcripts, proposals, programme descriptions or official guidance.",
}: {
  documents: SupportingDocument[];
  applicationId: string | null;
  applicationNames?: Record<string, string>;
  emptyText?: string;
}) {
  const router = useRouter();
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AddDocumentDialog applicationId={applicationId} />
      </div>
      {documents.length === 0 ? (
        <EmptyState icon={FileText} title="No documents yet" description={emptyText} />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{d.title}</span>
                  <ExtractionBadge value={d.extraction_status} />
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {DOCUMENT_TYPE_LABELS[d.doc_type]} · added {formatDate(d.created_at)}
                  {d.application_id && applicationNames?.[d.application_id] ? ` · ${applicationNames[d.application_id]}` : ""}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {d.file_path && d.file_name && <OpenFileButton path={d.file_path} name={d.file_name} />}
                <DocumentTextDialog doc={d} />
                <ConfirmAction
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${d.title}`}>
                      <Trash2 />
                    </Button>
                  }
                  title={`Delete “${d.title}”?`}
                  description="The file, its extracted text and its links to essays are deleted. Saved essay versions are not affected."
                  onConfirm={async () => {
                    const ok = handleResult(await deleteDocument(d.id), "Document deleted");
                    if (ok === null) return false;
                    router.refresh();
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
