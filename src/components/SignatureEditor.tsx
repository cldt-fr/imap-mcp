"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useState } from "react";

function looksLikeHtml(text: string): boolean {
  return /<([a-z][a-z0-9]*)\b[^>]*>/i.test(text);
}

export function SignatureEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const [mode, setMode] = useState<"wysiwyg" | "html">("wysiwyg");
  const [htmlDraft, setHtmlDraft] = useState(value);

  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    editorProps: {
      attributes: { class: "tiptap" },
      handlePaste: (_view, event) => {
        const clip = event.clipboardData;
        if (!clip) return false;
        // Rich HTML clipboard → let ProseMirror handle it natively.
        if (clip.getData("text/html")) return false;
        const plain = clip.getData("text/plain");
        if (plain && looksLikeHtml(plain)) {
          // Plain text whose content is HTML markup — parse & insert as HTML
          // so the user sees the rendered signature, not a wall of tags.
          event.preventDefault();
          editor?.commands.insertContent(plain);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    immediatelyRender: false,
  });

  useEffect(() => {
    if (mode === "wysiwyg" && editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, false);
    }
  }, [value, editor, mode]);

  useEffect(() => {
    if (mode === "html") setHtmlDraft(value);
  }, [mode, value]);

  function switchToWysiwyg() {
    onChange(htmlDraft);
    editor?.commands.setContent(htmlDraft, false);
    setMode("wysiwyg");
  }

  if (!editor) return <div className="tiptap">Loading…</div>;

  return (
    <div>
      <div className="tiptap-toolbar">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive("bold") ? "is-active" : ""}
          disabled={mode === "html"}
        >
          B
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive("italic") ? "is-active" : ""}
          disabled={mode === "html"}
        >
          <i>I</i>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={editor.isActive("strike") ? "is-active" : ""}
          disabled={mode === "html"}
        >
          <s>S</s>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive("bulletList") ? "is-active" : ""}
          disabled={mode === "html"}
        >
          •
        </button>
        <button
          type="button"
          onClick={() => {
            const url = window.prompt("URL:");
            if (!url) return;
            editor.chain().focus().extendMarkRange("link").run();
          }}
          disabled={mode === "html"}
        >
          link
        </button>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => (mode === "wysiwyg" ? setMode("html") : switchToWysiwyg())}
          className={mode === "html" ? "is-active" : ""}
          title="Edit raw HTML"
        >
          {mode === "html" ? "← Preview" : "< > HTML"}
        </button>
      </div>

      {mode === "wysiwyg" ? (
        <EditorContent editor={editor} />
      ) : (
        <textarea
          className="tiptap"
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 13,
          }}
          value={htmlDraft}
          onChange={(e) => {
            setHtmlDraft(e.target.value);
            onChange(e.target.value);
          }}
          spellCheck={false}
          placeholder="<p>Paste or edit raw HTML here…</p>"
        />
      )}

      <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        Tip: pasting HTML directly (e.g. from an email-signature generator) is parsed
        automatically. Use <strong>&lt; &gt; HTML</strong> to edit the raw source.
      </p>
    </div>
  );
}
