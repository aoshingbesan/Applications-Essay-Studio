"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileUpload } from "@/components/file-upload";
import { ExemplarMetaFields, exemplarMetaDefaults } from "./exemplar-meta-fields";
import { exemplarMetaSchema, type ExemplarMetaInput, type ExemplarMetaValues } from "@/lib/domain/schemas";
import { createExemplarFromText, createExemplarFromUpload } from "@/server/exemplars";
import { discardUpload } from "@/server/documents";
import { handleResult } from "@/lib/client/result";
import { countWords } from "@/lib/essay/doc";

export function UploadExemplarDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [permission, setPermission] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const form = useForm<ExemplarMetaInput, unknown, ExemplarMetaValues>({ resolver: zodResolver(exemplarMetaSchema), defaultValues: exemplarMetaDefaults() });

  const validMeta = async () => {
    if (!permission) {
      toast.error("Confirm that you may use this essay first.");
      return false;
    }
    return form.trigger();
  };

  const done = (id: string) => {
    setOpen(false);
    form.reset(exemplarMetaDefaults());
    setPermission(false);
    setText("");
    router.push(`/exemplars/${id}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Upload /> Upload exemplar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add an exemplar essay</DialogTitle>
          <DialogDescription>
            Exemplars are for learning techniques, not for copying. You will be able to check the extracted text before any analysis runs.
          </DialogDescription>
        </DialogHeader>

        <ExemplarMetaFields form={form} />

        <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
            <TabsList>
              <TabsTrigger value="file">Upload file</TabsTrigger>
              <TabsTrigger value="paste">Paste text</TabsTrigger>
            </TabsList>
          </Tabs>
          {mode === "paste" && (
            <div className="space-y-1.5">
              <Label htmlFor="ex-text">Essay text</Label>
              <Textarea id="ex-text" rows={10} className="font-serif" value={text} onChange={(e) => setText(e.target.value)} />
              <p className="text-xs text-muted-foreground">{countWords(text)} words</p>
            </div>
          )}
          <div className="flex items-start gap-2.5">
            <Checkbox id="ex-permission" checked={permission} onCheckedChange={(v) => setPermission(v === true)} className="mt-0.5" />
            <Label htmlFor="ex-permission" className="text-sm leading-snug font-normal">
              I have permission to use this material for my own learning, and I have removed personal information about other people (names, contact details, private circumstances) that is not needed.
            </Label>
          </div>
          {mode === "file" ? (
            <FileUpload
              folder="exemplars"
              label="Choose PDF, DOCX or TXT and upload"
              disabled={!permission}
              onUploaded={async (f) => {
                if (!(await validMeta())) {
                  await discardUpload(f.path);
                  return;
                }
                const res = handleResult(await createExemplarFromUpload({ path: f.path, fileName: f.name, meta: form.getValues(), permissionConfirmed: permission }));
                if (!res) return;
                if (res.status !== "extracted") toast.warning("Exemplar saved, but its text could not be read", { description: res.message ?? undefined, duration: 12000 });
                else toast.success("Exemplar added — check the extracted text before analysing");
                done(res.id);
              }}
            />
          ) : (
            <Button
              disabled={busy || !permission || countWords(text) < 50}
              onClick={async () => {
                if (!(await validMeta())) return;
                setBusy(true);
                const res = handleResult(await createExemplarFromText({ text, meta: form.getValues(), permissionConfirmed: permission }), "Exemplar added");
                setBusy(false);
                if (res) done(res.id);
              }}
            >
              {busy && <Loader2 className="animate-spin" />} Save exemplar
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
