"use client";

import { useState } from "react";

export function CopyButton({
  value,
  label = "Copy",
  className = "btn btn-sm",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  return (
    <button type="button" onClick={copy} className={className}>
      {copied ? "✓ Copied" : label}
    </button>
  );
}

export function CopyBlock({
  value,
  multiline = false,
}: {
  value: string;
  multiline?: boolean;
}) {
  return (
    <div
      className="code-block"
      style={multiline ? { whiteSpace: "pre", display: "flex", alignItems: "flex-start" } : undefined}
    >
      <code style={multiline ? { whiteSpace: "pre" } : undefined}>{value}</code>
      <CopyButton value={value} />
    </div>
  );
}
