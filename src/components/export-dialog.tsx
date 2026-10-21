"use client";

import { useState } from "react";
import { Download, FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { ExportSettings } from "@/lib/domain/types";

const FORMATS = [
  { id: "docx", label: "Word (.docx)" },
  { id: "pdf", label: "PDF" },
  { id: "txt", label: "Plain text" },
] as const;

/** Downloads a server-generated export of the saved essays. */
async function download(url: string): Promise<boolean> {
  const res = await fetch(url);
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    toast.error(json?.error ?? "Export failed. Please try again.");
    return false;
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "essay";
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  toast.success(`Exported ${name}`);
  return true;
}

export function ExportDialog({
  essays,
  defaultTitle,
  defaults,
  beforeExport,
  trigger,
  warning,
}: {
  essays: { id: string; title: string }[];
  defaultTitle: string;
  defaults?: ExportSettings;
  /** Saves pending edits first; returns false to abort. */
  beforeExport?: () => Promise<boolean>;
  trigger?: React.ReactNode;
  warning?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(essays.map((e) => e.id));
  const [font, setFont] = useState(defaults?.font ?? "serif");
  const [fontSize, setFontSize] = useState(String(defaults?.fontSize ?? 12));
  const [margins, setMargins] = useState(defaults?.margins ?? "normal");
  const [lineSpacing, setLineSpacing] = useState(String(defaults?.lineSpacing ?? 1.5));
  const [pageNumbers, setPageNumbers] = useState(defaults?.pageNumbers ?? true);
  const [titles, setTitles] = useState(essays.length > 1);
  const [cover, setCover] = useState(false);
  const [coverTitle, setCoverTitle] = useState(defaultTitle);
  const [coverAuthor, setCoverAuthor] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (format: string) => {
    if (selected.length === 0) {
      toast.error("Choose at least one essay.");
      return;
    }
    setBusy(format);
    try {
      if (beforeExport && !(await beforeExport())) return;
      const q = new URLSearchParams({
        essayIds: essays.filter((e) => selected.includes(e.id)).map((e) => e.id).join(","),
        format,
        font,
        fontSize,
        margins,
        lineSpacing,
        pageNumbers: pageNumbers ? "1" : "0",
        titles: titles ? "1" : "0",
        cover: cover ? "1" : "0",
      });
      if (cover) {
        q.set("coverTitle", coverTitle);
        if (coverAuthor) q.set("coverAuthor", coverAuthor);
      }
      await download(`/api/export?${q.toString()}`);
    } catch {
      toast.error("Export failed. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const select = (id: string, label: string, value: string, onChange: (v: string) => void, options: [string, string][]) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <FileDown /> Export
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>Exports contain only your saved essay text — no AI notes, review findings or metadata.</DialogDescription>
        </DialogHeader>
        {warning}
        {essays.length > 1 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Essays</legend>
            {essays.map((e) => (
              <div key={e.id} className="flex items-center gap-2">
                <Checkbox
                  id={`exp-${e.id}`}
                  checked={selected.includes(e.id)}
                  onCheckedChange={(v) => setSelected((s) => (v === true ? [...s, e.id] : s.filter((x) => x !== e.id)))}
                />
                <Label htmlFor={`exp-${e.id}`} className="font-normal">
                  {e.title}
                </Label>
              </div>
            ))}
          </fieldset>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {select("exp-font", "Font", font, (v) => setFont(v as typeof font), [
            ["serif", "Serif (Times)"],
            ["sans", "Sans-serif (Arial / Helvetica)"],
            ["mono", "Monospace (Courier)"],
          ])}
          {select("exp-size", "Font size", fontSize, setFontSize, ["10", "11", "12", "13", "14"].map((s) => [s, `${s} pt`]))}
          {select("exp-margins", "Margins", margins, (v) => setMargins(v as typeof margins), [
            ["narrow", "Narrow (1.27 cm)"],
            ["normal", "Normal (2.54 cm)"],
            ["wide", "Wide (3.81 cm)"],
          ])}
          {select("exp-spacing", "Line spacing", lineSpacing, setLineSpacing, [
            ["1", "Single"],
            ["1.15", "1.15"],
            ["1.5", "1.5"],
            ["2", "Double"],
          ])}
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="exp-pages">Page numbers (DOCX and PDF)</Label>
            <Switch id="exp-pages" checked={pageNumbers} onCheckedChange={setPageNumbers} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="exp-titles">Print essay titles</Label>
            <Switch id="exp-titles" checked={titles} onCheckedChange={setTitles} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="exp-cover">Cover page</Label>
            <Switch id="exp-cover" checked={cover} onCheckedChange={setCover} />
          </div>
          {cover && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="exp-ctitle">Cover title</Label>
                <Input id="exp-ctitle" value={coverTitle} onChange={(e) => setCoverTitle(e.target.value)} maxLength={300} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exp-cauthor">Name (optional)</Label>
                <Input id="exp-cauthor" value={coverAuthor} onChange={(e) => setCoverAuthor(e.target.value)} maxLength={200} />
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-start">
          {FORMATS.map((f) => (
            <Button key={f.id} variant={f.id === "docx" ? "default" : "outline"} disabled={busy !== null} onClick={() => void run(f.id)}>
              {busy === f.id ? <Loader2 className="animate-spin" /> : <Download />} {f.label}
            </Button>
          ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
