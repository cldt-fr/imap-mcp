import { z } from "zod";

export const writingStyleSchema = z
  .object({
    preset: z.string().max(40).optional(),
    language: z.string().min(2).max(10).optional(), // ISO 639-1 or BCP-47
    tone: z
      .enum(["professional", "casual", "warm", "direct", "enthusiastic"])
      .optional(),
    formality: z.enum(["tu", "vous", "formal", "informal", "auto"]).optional(),
    greeting: z.string().max(200).optional(),
    signOff: z.string().max(200).optional(),
    length: z.enum(["concise", "balanced", "detailed"]).optional(),
    emojis: z.enum(["never", "sparingly", "liberally"]).optional(),
    formatting: z.enum(["plain", "html"]).optional(),
    customInstructions: z.string().max(2000).optional(),
  })
  .strict();

export type WritingStyle = z.infer<typeof writingStyleSchema>;

export interface StylePreset extends WritingStyle {
  id: string;
  name: string;
  description: string;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "pro-fr",
    name: "Pro — FR",
    description: "Professionnel français, vouvoiement, concis, sans emojis.",
    preset: "pro-fr",
    language: "fr",
    tone: "professional",
    formality: "vous",
    greeting: "Bonjour,",
    signOff: "Cordialement,",
    length: "concise",
    emojis: "never",
    formatting: "plain",
    customInstructions: "",
  },
  {
    id: "warm-fr",
    name: "Chaleureux — FR",
    description: "Ton chaleureux, tutoiement, un emoji de temps en temps.",
    preset: "warm-fr",
    language: "fr",
    tone: "warm",
    formality: "tu",
    greeting: "Salut,",
    signOff: "Bien à toi,",
    length: "balanced",
    emojis: "sparingly",
    formatting: "plain",
    customInstructions: "",
  },
  {
    id: "direct-fr",
    name: "Direct — FR",
    description: "Minimal, pas de formules de politesse superflues.",
    preset: "direct-fr",
    language: "fr",
    tone: "direct",
    formality: "auto",
    greeting: "",
    signOff: "",
    length: "concise",
    emojis: "never",
    formatting: "plain",
    customInstructions:
      "Aller droit au but. Pas de \"j'espère que tu vas bien\" ni de paraphrase de la question. Si une action est attendue, la formuler clairement.",
  },
  {
    id: "pro-en",
    name: "Pro — EN",
    description: "Polished, concise, no-fluff English.",
    preset: "pro-en",
    language: "en",
    tone: "professional",
    formality: "formal",
    greeting: "Hi,",
    signOff: "Best regards,",
    length: "concise",
    emojis: "never",
    formatting: "plain",
    customInstructions: "",
  },
  {
    id: "casual-en",
    name: "Casual — EN",
    description: "Friendly conversational English.",
    preset: "casual-en",
    language: "en",
    tone: "casual",
    formality: "informal",
    greeting: "Hey,",
    signOff: "Cheers,",
    length: "balanced",
    emojis: "sparingly",
    formatting: "plain",
    customInstructions: "",
  },
];

/**
 * Turns the structured style into a plain-English directive that Claude can
 * follow verbatim. Returned verbatim from list_accounts so Claude never has
 * to interpret the raw JSON fields.
 */
export function renderStyleInstructions(style: WritingStyle | null | undefined): string {
  if (!style) return "";
  const parts: string[] = [];

  const langName: Record<string, string> = {
    fr: "French",
    en: "English",
    es: "Spanish",
    de: "German",
    it: "Italian",
    pt: "Portuguese",
    nl: "Dutch",
  };
  if (style.language) {
    parts.push(`Write in ${langName[style.language] ?? style.language}.`);
  }

  if (style.tone) {
    const toneLabels: Record<string, string> = {
      professional: "a professional tone",
      casual: "a casual tone",
      warm: "a warm, friendly tone",
      direct: "a direct, no-fluff tone",
      enthusiastic: "an enthusiastic, upbeat tone",
    };
    parts.push(`Use ${toneLabels[style.tone]}.`);
  }

  if (style.formality) {
    const formalityLabels: Record<string, string> = {
      tu: "Use the informal second-person in French (tutoiement).",
      vous: "Use the formal second-person in French (vouvoiement).",
      formal: "Use a formal register (titles, full names, no slang).",
      informal: "Use an informal register (first names, contractions allowed).",
      auto: "Match the recipient's existing register; if unknown, default to formal.",
    };
    parts.push(formalityLabels[style.formality]);
  }

  if (style.greeting !== undefined) {
    if (style.greeting.trim()) {
      parts.push(`Open with: "${style.greeting.trim()}"`);
    } else {
      parts.push("Skip the opening greeting.");
    }
  }
  if (style.signOff !== undefined) {
    if (style.signOff.trim()) {
      parts.push(`Close with: "${style.signOff.trim()}"`);
    } else {
      parts.push("Skip the closing sign-off.");
    }
  }

  if (style.length) {
    const lengthLabels: Record<string, string> = {
      concise: "Keep the email concise — 2 to 4 short paragraphs max.",
      balanced: "Use a balanced length — enough to cover context, not more.",
      detailed: "Feel free to be detailed when the topic warrants it.",
    };
    parts.push(lengthLabels[style.length]);
  }

  if (style.emojis) {
    const emojiLabels: Record<string, string> = {
      never: "Do not use emojis.",
      sparingly: "Use emojis sparingly (one or two per email at most, only when they add meaning).",
      liberally: "Emojis are welcome — use them when they match the tone.",
    };
    parts.push(emojiLabels[style.emojis]);
  }

  if (style.formatting) {
    parts.push(
      style.formatting === "html"
        ? "Prefer HTML formatting (lists, bold, links) when it improves clarity."
        : "Prefer plain text; avoid HTML formatting unless the user explicitly asks for it.",
    );
  }

  if (style.customInstructions?.trim()) {
    parts.push(`Additional rules from the user:\n${style.customInstructions.trim()}`);
  }

  return parts.join(" ").replace(/\. Additional/, ".\n\nAdditional");
}

export function isEmptyStyle(style: WritingStyle | null | undefined): boolean {
  if (!style) return true;
  return !Object.values(style).some((v) => {
    if (v === undefined || v === null) return false;
    if (typeof v === "string") return v.trim().length > 0;
    return true;
  });
}
