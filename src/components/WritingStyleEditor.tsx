"use client";

import { useMemo } from "react";
import {
  STYLE_PRESETS,
  renderStyleInstructions,
  type WritingStyle,
} from "@/lib/writing-style";

type Props = {
  value: WritingStyle;
  onChange: (next: WritingStyle) => void;
};

const LANGUAGE_OPTIONS: Array<{ code: string; name: string }> = [
  { code: "fr", name: "Français" },
  { code: "en", name: "English" },
  { code: "es", name: "Español" },
  { code: "de", name: "Deutsch" },
  { code: "it", name: "Italiano" },
  { code: "pt", name: "Português" },
  { code: "nl", name: "Nederlands" },
];

type ToneOption = NonNullable<WritingStyle["tone"]>;
type FormalityOption = NonNullable<WritingStyle["formality"]>;
type LengthOption = NonNullable<WritingStyle["length"]>;
type EmojiOption = NonNullable<WritingStyle["emojis"]>;
type FormattingOption = NonNullable<WritingStyle["formatting"]>;

const TONES: Array<{ value: ToneOption; label: string }> = [
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "warm", label: "Warm" },
  { value: "direct", label: "Direct" },
  { value: "enthusiastic", label: "Enthusiastic" },
];

const FORMALITIES: Array<{ value: FormalityOption; label: string; hint: string }> = [
  { value: "tu", label: "Tu", hint: "French informal" },
  { value: "vous", label: "Vous", hint: "French formal" },
  { value: "formal", label: "Formal", hint: "Titles, full names" },
  { value: "informal", label: "Informal", hint: "First names, contractions" },
  { value: "auto", label: "Auto", hint: "Match the recipient" },
];

const LENGTHS: Array<{ value: LengthOption; label: string }> = [
  { value: "concise", label: "Concise" },
  { value: "balanced", label: "Balanced" },
  { value: "detailed", label: "Detailed" },
];

const EMOJIS: Array<{ value: EmojiOption; label: string }> = [
  { value: "never", label: "Never" },
  { value: "sparingly", label: "Sparingly" },
  { value: "liberally", label: "Liberally" },
];

const FORMATTINGS: Array<{ value: FormattingOption; label: string }> = [
  { value: "plain", label: "Plain text" },
  { value: "html", label: "HTML" },
];

export function WritingStyleEditor({ value, onChange }: Props) {
  function patch<K extends keyof WritingStyle>(key: K, v: WritingStyle[K]) {
    onChange({ ...value, preset: undefined, [key]: v });
  }

  function applyPreset(id: string) {
    const p = STYLE_PRESETS.find((x) => x.id === id);
    if (!p) return;
    const { id: _id, name: _name, description: _desc, ...rest } = p;
    void _id;
    void _name;
    void _desc;
    onChange({ ...rest });
  }

  function clearAll() {
    onChange({});
  }

  const preview = useMemo(() => renderStyleInstructions(value), [value]);
  const isCustomized = value.preset === undefined && preview.length > 0;

  return (
    <div className="stack">
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 13, alignSelf: "center" }}>
          Quick presets:
        </span>
        {STYLE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`btn btn-sm ${value.preset === p.id ? "btn-primary" : ""}`}
            onClick={() => applyPreset(p.id)}
            title={p.description}
          >
            {p.name}
          </button>
        ))}
        <button type="button" className="btn btn-sm btn-ghost" onClick={clearAll}>
          Clear
        </button>
      </div>
      {isCustomized && (
        <p className="muted" style={{ fontSize: 12 }}>
          Custom style (not matching a preset).
        </p>
      )}

      <div className="grid-2">
        <div className="field">
          <label>Language</label>
          <select
            className="select"
            value={value.language ?? ""}
            onChange={(e) => patch("language", e.target.value || undefined)}
          >
            <option value="">— not set —</option>
            {LANGUAGE_OPTIONS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Tone</label>
          <select
            className="select"
            value={value.tone ?? ""}
            onChange={(e) =>
              patch("tone", (e.target.value || undefined) as ToneOption | undefined)
            }
          >
            <option value="">— not set —</option>
            {TONES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label>Formality</label>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {FORMALITIES.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`btn btn-sm ${value.formality === f.value ? "btn-primary" : ""}`}
              onClick={() =>
                patch("formality", value.formality === f.value ? undefined : f.value)
              }
              title={f.hint}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <div className="field">
          <label>Opening phrase</label>
          <input
            className="input"
            value={value.greeting ?? ""}
            onChange={(e) => patch("greeting", e.target.value)}
            placeholder="Bonjour, / Hi, / (leave empty to skip)"
            maxLength={200}
          />
        </div>
        <div className="field">
          <label>Closing phrase</label>
          <input
            className="input"
            value={value.signOff ?? ""}
            onChange={(e) => patch("signOff", e.target.value)}
            placeholder="Cordialement, / Best, / (leave empty to skip)"
            maxLength={200}
          />
        </div>
      </div>

      <div className="field">
        <label>Length</label>
        <div className="row" style={{ gap: 8 }}>
          {LENGTHS.map((l) => (
            <button
              key={l.value}
              type="button"
              className={`btn btn-sm ${value.length === l.value ? "btn-primary" : ""}`}
              onClick={() =>
                patch("length", value.length === l.value ? undefined : l.value)
              }
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <div className="field">
          <label>Emojis</label>
          <div className="row" style={{ gap: 8 }}>
            {EMOJIS.map((e) => (
              <button
                key={e.value}
                type="button"
                className={`btn btn-sm ${value.emojis === e.value ? "btn-primary" : ""}`}
                onClick={() =>
                  patch("emojis", value.emojis === e.value ? undefined : e.value)
                }
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Default format</label>
          <div className="row" style={{ gap: 8 }}>
            {FORMATTINGS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={`btn btn-sm ${value.formatting === f.value ? "btn-primary" : ""}`}
                onClick={() =>
                  patch(
                    "formatting",
                    value.formatting === f.value ? undefined : f.value,
                  )
                }
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="field">
        <label>
          Custom rules <span className="hint">(anything the preset can&apos;t express)</span>
        </label>
        <textarea
          className="textarea"
          rows={4}
          maxLength={2000}
          value={value.customInstructions ?? ""}
          onChange={(e) => patch("customInstructions", e.target.value)}
          placeholder="E.g. Always suggest a phone slot when relevant. Never use 'I hope you are well'. Sign with first name only."
        />
        <span className="hint">
          {(value.customInstructions ?? "").length} / 2000
        </span>
      </div>

      <div className="field">
        <label>Preview — the directive Claude will follow</label>
        <pre
          className="code-block"
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: 200,
            overflow: "auto",
          }}
        >
          <code>{preview || "(no style set — Claude will use its defaults)"}</code>
        </pre>
      </div>
    </div>
  );
}
