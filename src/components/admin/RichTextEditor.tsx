"use client";

import { useId, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Bold, Heading2, Heading3, ImagePlus, Italic, Link2, Link2Off, List, ListOrdered, Redo2, SquareDashedText, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { acceptImage, IMAGE_ACCEPT } from "@/lib/storage";
import { isRichTextEmpty, normalizeLink, toRichHtml } from "@/lib/rich-text";

/** The hint under an activity's description: how its About and sections come out on the attendee's page. */
export const SECTIONS_HINT = "Shown under About on the activity's page. Each Section heading starts its own block, like Scoring or Prizes.";

export type UploadImage = (fd: FormData) => Promise<{ url: string } | { error: string }>;

const field = "h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * The editor for an organiser's long-form text: an activity's description, the info page.
 *
 * Only the formats the pages can show are offered, and only those are kept on paste - the
 * starter kit's code, strike, underline and rule are switched off, so pasting from Word or
 * WhatsApp brings bold, lists and links across and leaves fonts and colours behind. What the
 * organiser sees here is drawn with the same `rich-text` styles the attendee's page uses.
 *
 * "Section" writes an h2, which is where `splitSections` starts a new block on the activity
 * page; "Subheading" writes an h3, which stays inside one. "Highlight box" is a blockquote,
 * drawn as a grey panel.
 *
 * The HTML rides the surrounding form in a hidden input named `name`, so the Server Action
 * that saves it reads one field as it always did. An editor nobody typed in posts "" rather
 * than `<p></p>`. `sanitizeHtml` still stands between this and the page; nothing here is the
 * security boundary.
 *
 * Images are offered only when `uploadImage` is: the upload goes up on its own, and the image
 * lands where the cursor was rather than at the end of the text.
 */
export function RichTextEditor({ name, label, defaultValue, description, uploadImage, minHeight = 180 }: {
  name: string;
  label: string;
  defaultValue?: string | null;
  description?: string;
  uploadImage?: UploadImage;
  minHeight?: number;
}) {
  const id = useId();
  const initial = toRichHtml(defaultValue);
  const [html, setHtml] = useState(initial);
  const [panel, setPanel] = useState<"link" | "image" | null>(null);

  const editor = useEditor({
    // Rendered on the server as an empty shell and filled in once the browser has it:
    // ProseMirror needs a DOM, and rendering it twice would disagree about the markup.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        strike: false,
        underline: false,
        horizontalRule: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      ...(uploadImage ? [Image.configure({ inline: false })] : []),
    ],
    content: initial,
    editorProps: {
      attributes: {
        id,
        "aria-label": label,
        class: "rich-text prose prose-sm max-w-none px-3 py-2.5 outline-none",
        style: `min-height:${minHeight}px`,
      },
    },
    onUpdate: ({ editor }) => {
      const out = editor.getHTML();
      setHtml(isRichTextEmpty(out) ? "" : out);
    },
  });

  return (
    <div className="flex flex-col gap-1.5">
      {/* A span, not a label: a label cannot point at a contenteditable. The editor carries
          its own aria-label instead. */}
      <span className="text-sm font-bold">{label}</span>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="overflow-hidden rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        {editor ? (
          <Toolbar editor={editor} panel={panel} setPanel={setPanel} images={Boolean(uploadImage)} />
        ) : (
          <div className="h-10 border-b border-border bg-muted/40" />
        )}
        {editor && panel === "link" && <LinkPanel editor={editor} close={() => setPanel(null)} />}
        {editor && panel === "image" && uploadImage && <ImagePanel editor={editor} upload={uploadImage} close={() => setPanel(null)} />}
        <EditorContent editor={editor} />
      </div>
      <input type="hidden" name={name} value={html} />
    </div>
  );
}

function Toolbar({ editor, panel, setPanel, images }: {
  editor: Editor;
  panel: "link" | "image" | null;
  setPanel: (p: "link" | "image" | null) => void;
  images: boolean;
}) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      box: e.isActive("blockquote"),
      link: e.isActive("link"),
      undo: e.can().undo(),
      redo: e.can().redo(),
    }),
  });
  const run = () => editor.chain().focus();
  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 p-1">
      <Tool label="Bold" on={s.bold} onClick={() => run().toggleBold().run()}><Bold /></Tool>
      <Tool label="Italic" on={s.italic} onClick={() => run().toggleItalic().run()}><Italic /></Tool>
      <Sep />
      <Tool label="Section" text on={s.h2} onClick={() => run().toggleHeading({ level: 2 }).run()}><Heading2 /></Tool>
      <Tool label="Subheading" on={s.h3} onClick={() => run().toggleHeading({ level: 3 }).run()}><Heading3 /></Tool>
      <Sep />
      <Tool label="Bulleted list" on={s.bullet} onClick={() => run().toggleBulletList().run()}><List /></Tool>
      <Tool label="Numbered list" on={s.ordered} onClick={() => run().toggleOrderedList().run()}><ListOrdered /></Tool>
      <Tool label="Highlight box" text on={s.box} onClick={() => run().toggleBlockquote().run()}><SquareDashedText /></Tool>
      <Sep />
      <Tool label={s.link ? "Edit link" : "Link"} on={s.link || panel === "link"} onClick={() => setPanel(panel === "link" ? null : "link")}><Link2 /></Tool>
      {images && <Tool label="Image" on={panel === "image"} onClick={() => setPanel(panel === "image" ? null : "image")}><ImagePlus /></Tool>}
      <span className="ml-auto flex">
        <Tool label="Undo" disabled={!s.undo} onClick={() => run().undo().run()}><Undo2 /></Tool>
        <Tool label="Redo" disabled={!s.redo} onClick={() => run().redo().run()}><Redo2 /></Tool>
      </span>
    </div>
  );
}

/** One toolbar button. `text` also prints its label, for the two whose icon alone would not say what they are for. */
function Tool({ label, on = false, text = false, disabled = false, onClick, children }: {
  label: string;
  on?: boolean;
  text?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={on ? "secondary" : "ghost"}
      size={text ? "sm" : "icon-sm"}
      aria-label={text ? undefined : label}
      aria-pressed={on}
      title={label}
      disabled={disabled}
      // Keeps the text selected: a button that took focus would lose the selection it acts on.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={on ? "bg-background text-foreground ring-1 ring-border" : "text-muted-foreground"}
    >
      {children}
      {text && label}
    </Button>
  );
}

const Sep = () => <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />;

function LinkPanel({ editor, close }: { editor: Editor; close: () => void }) {
  const current = (editor.getAttributes("link").href as string | undefined) ?? "";
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const hasText = !editor.state.selection.empty || editor.isActive("link");

  function apply() {
    const href = normalizeLink(value);
    if (!href) { setError("Enter a web address, an email address or a phone link."); return; }
    const chain = editor.chain().focus().extendMarkRange("link");
    // No words selected: the address itself becomes the link's text.
    if (hasText) chain.setLink({ href }).run();
    else chain.insertContent({ type: "text", text: value.trim(), marks: [{ type: "link", attrs: { href } }] }).run();
    close();
  }

  return (
    <div className="flex flex-col gap-1.5 border-b border-border p-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } if (e.key === "Escape") close(); }}
          placeholder="activatwork.perkeso.gov.my"
          aria-label="Link address"
          aria-invalid={Boolean(error)}
          className={`${field} flex-1 basis-48`}
        />
        <Button type="button" size="sm" onClick={apply}>{current ? "Update" : "Add link"}</Button>
        {current && (
          <Button type="button" size="sm" variant="ghost" onClick={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); close(); }}>
            <Link2Off />Remove
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={close}>Cancel</Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function ImagePanel({ editor, upload, close }: { editor: Editor; upload: UploadImage; close: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function choose(f: File | undefined) {
    setError(null);
    if (!f) return;
    try { acceptImage(f); } catch (e) { setError((e as Error).message); if (input.current) input.current.value = ""; return; }
    setFile(f);
  }

  async function insert() {
    if (!file) { setError("Choose an image first."); return; }
    setBusy(true);
    const fd = new FormData();
    fd.set("image", file);
    const res = await upload(fd).catch(() => ({ error: "Could not upload that image. Try again." }));
    setBusy(false);
    if ("error" in res) { setError(res.error); return; }
    editor.chain().focus().setImage({ src: res.url, alt: alt.trim() }).run();
    close();
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => input.current?.click()}>
          <ImagePlus />{file ? "Choose another" : "Choose image"}
        </Button>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{file ? file.name : "PNG, JPEG, WebP or SVG, up to 4 MB."}</span>
        <input ref={input} type="file" accept={IMAGE_ACCEPT} className="sr-only" tabIndex={-1} onChange={(e) => choose(e.target.files?.[0])} />
      </div>
      {file && (
        <div className="flex flex-wrap items-center gap-2">
          {/* The only moment anyone knows what the picture shows. Left blank, it is read as decoration. */}
          <input value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Describe this image, e.g. Ballroom floor plan" aria-label="Describe this image" className={`${field} flex-1 basis-48`} />
          <Button type="button" size="sm" disabled={busy} onClick={insert}>{busy && <Spinner />}Insert</Button>
          <Button type="button" size="sm" variant="ghost" onClick={close}>Cancel</Button>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
