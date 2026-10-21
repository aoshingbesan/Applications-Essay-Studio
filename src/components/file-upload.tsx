"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { getSignedFileUrl, prepareUpload } from "@/server/documents";
import { handleResult } from "@/lib/client/result";
import { DOCUMENT_EXTENSIONS, STORAGE_BUCKET } from "@/lib/domain/constants";
import { validateUploadMeta } from "@/lib/documents/upload";

export interface UploadedFile {
  path: string;
  name: string;
}

/**
 * Validates a file, then uploads it straight to the private bucket under the user's folder.
 * The server re-validates and extracts the text after upload.
 */
export function FileUpload({
  folder,
  onUploaded,
  label = "Choose file",
  disabled,
}: {
  folder: "documents" | "exemplars";
  onUploaded: (f: UploadedFile) => void | Promise<void>;
  label?: string;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    const problem = validateUploadMeta({ name: file.name, size: file.size, type: file.type });
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    try {
      const target = handleResult(await prepareUpload({ name: file.name, size: file.size, type: file.type }, folder));
      if (!target) return;
      const { error } = await createClient().storage.from(STORAGE_BUCKET).upload(target.path, file, { contentType: file.type || undefined, upsert: false });
      if (error) {
        toast.error("Upload failed. Check your connection and try again.");
        return;
      }
      await onUploaded({ path: target.path, name: file.name });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        accept={DOCUMENT_EXTENSIONS.join(",")}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      <Button type="button" variant="outline" disabled={busy || disabled} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="animate-spin" /> : <FileUp />}
        {busy ? "Uploading and reading…" : label}
      </Button>
    </>
  );
}

export function OpenFileButton({ path, name }: { path: string; name: string }) {
  const open = async () => {
    const res = handleResult(await getSignedFileUrl(path));
    if (res) window.open(res.url, "_blank", "noopener,noreferrer");
  };
  return (
    <Button type="button" variant="ghost" size="sm" onClick={open} title="Opens a secure link that expires in 60 seconds">
      <Paperclip /> <span className="max-w-48 truncate">{name}</span>
    </Button>
  );
}
