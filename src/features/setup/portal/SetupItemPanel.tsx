"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SETUP_BUCKET } from "@/lib/storage";
import { browserStorage } from "@/lib/supabase/browser";
import { acceptSetupFile, formatBytes, MAX_FILES_PER_ITEM, NOTE_MAX, SETUP_FILE_ACCEPT, withContentType, type HubFile } from "../hub";
import { finishSetupUploadAction, removeSetupFileAction, saveSetupNoteAction, setupFileLinkAction, startSetupUploadAction } from "./hub-actions";

const NOTE_SAVE_MS = 1000;
const UPLOAD_FAILED = "couldn't upload — check your connection and try again.";
const NOTE_FAILED = "Couldn't save your note — check your connection. Change it to try again.";

/**
 * One checklist item's files and note (D458). Each file goes straight to the private bucket on a
 * path the server minted, then is recorded (D459), so its size isn't capped by the 4.5 MB request
 * limit. The note saves a second after the last keystroke; the browser asks before leaving with
 * one unsaved.
 */
export function SetupItemPanel({ token, itemKey, initialFiles, initialNotes, notesPlaceholder = "Anything we should know about this" }: {
  token: string;
  itemKey: string;
  initialFiles: HubFile[];
  initialNotes: string;
  notesPlaceholder?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState(initialFiles);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [notes, setNotes] = useState(initialNotes);
  const [noteState, setNoteState] = useState<"idle" | "saving" | "saved">("idle");
  const savedNote = useRef(initialNotes);
  const latestNote = useRef(initialNotes);

  useEffect(() => {
    if (notes === savedNote.current) return;
    const t = setTimeout(async () => {
      setNoteState("saving");
      try {
        const r = await saveSetupNoteAction(token, itemKey, notes);
        if (!r.ok) {
          setNoteState("idle");
          setNoteError(r.message);
          return;
        }
        savedNote.current = notes;
        setNoteState("saved");
        setNoteError(null);
        router.refresh();
      } catch {
        setNoteState("idle");
        setNoteError(NOTE_FAILED);
      }
    }, NOTE_SAVE_MS);
    return () => clearTimeout(t);
  }, [notes, token, itemKey, router]);

  // Leaving for another page in the app doesn't fire beforeunload, and the timer above is cancelled
  // on unmount, so a note typed in the last second is sent here (fire and forget).
  useEffect(() => {
    const note = latestNote;
    const saved = savedNote;
    return () => {
      if (note.current !== saved.current) void saveSetupNoteAction(token, itemKey, note.current).catch(() => {});
    };
  }, [token, itemKey]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (notes === savedNote.current && busy === null) return;
      e.preventDefault();
      e.returnValue = true;
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [notes, busy]);

  const upload = async (picked: File[]) => {
    if (picked.length === 0) return;
    const problems: string[] = [];
    if (files.length + picked.length > MAX_FILES_PER_ITEM) {
      setErrors([`Up to ${MAX_FILES_PER_ITEM} files per item. Remove some first.`]);
      return;
    }
    for (const [n, file] of picked.entries()) {
      const ok = acceptSetupFile(file);
      if (!ok.ok) { problems.push(`${file.name}: ${ok.message}`); continue; }
      setBusy(picked.length > 1 ? `Uploading ${n + 1} of ${picked.length}…` : "Uploading…");
      try {
        const start = await startSetupUploadAction(token, itemKey, { name: file.name, size: file.size });
        if (!start.ok) { problems.push(`${file.name}: ${start.message}`); continue; }
        const { error } = await browserStorage().storage.from(SETUP_BUCKET).uploadToSignedUrl(start.path, start.uploadToken, withContentType(file, start.contentType), { contentType: start.contentType });
        if (error) { problems.push(`${file.name}: ${UPLOAD_FAILED}`); continue; }
        const done = await finishSetupUploadAction(token, itemKey, start.path, file.name);
        if (!done.ok) { problems.push(`${file.name}: ${done.message}`); continue; }
        setFiles((p) => [...p, done.file]);
      } catch {
        problems.push(`${file.name}: ${UPLOAD_FAILED}`);
      }
    }
    setBusy(null);
    setErrors(problems);
    router.refresh();
  };

  // A download link carries the file's name, so the browser saves it and the page stays.
  const open = async (f: HubFile) => {
    const r = await setupFileLinkAction(token, f.id).catch(() => null);
    if (r?.ok) window.location.assign(r.url);
    else setErrors([r?.message ?? "Couldn't open that file — check your connection."]);
  };

  const remove = async (f: HubFile) => {
    if (!window.confirm(`Remove ${f.name}?`)) return;
    const r = await removeSetupFileAction(token, f.id).catch(() => null);
    if (r?.ok) { setFiles((p) => p.filter((x) => x.id !== f.id)); router.refresh(); }
    else setErrors([r?.message ?? "Couldn't remove that file — check your connection."]);
  };

  return (
    <div className="flex flex-col gap-3">
      {files.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <button type="button" className="min-w-0 flex-1 truncate text-left font-semibold hover:underline" onClick={() => open(f)}>{f.name}</button>
              <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(f.size_bytes)}</span>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${f.name}`} onClick={() => remove(f)}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => input.current?.click()}>
          <Upload />{busy ?? "Upload files"}
        </Button>
        <span className="text-xs text-muted-foreground">Excel, CSV, Word, PDF, PowerPoint or images, up to 25 MB each.</span>
        <input ref={input} type="file" multiple accept={SETUP_FILE_ACCEPT} className="sr-only" tabIndex={-1}
          onChange={(e) => { const picked = [...(e.target.files ?? [])]; e.target.value = ""; void upload(picked); }} />
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="flex items-center text-sm font-bold">
          Note
          <span className="ml-auto text-xs font-normal text-muted-foreground" aria-live="polite">{noteState === "saving" ? "Saving…" : noteState === "saved" ? "Saved" : ""}</span>
        </span>
        <Textarea rows={3} maxLength={NOTE_MAX} value={notes} placeholder={notesPlaceholder} onChange={(e) => { latestNote.current = e.target.value; setNotes(e.target.value); }} />
      </label>
      {[...errors, ...(noteError ? [noteError] : [])].map((m, i) => <p key={i} role="alert" className="text-xs font-semibold text-destructive">{m}</p>)}
    </div>
  );
}
