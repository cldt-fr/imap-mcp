"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface CalendarAccountFormValues {
  label: string;
  caldavUrl: string;
  username: string;
  password: string;
  defaultCalendarUrl: string;
  color: string;
  isDefault: boolean;
}

const empty: CalendarAccountFormValues = {
  label: "",
  caldavUrl: "",
  username: "",
  password: "",
  defaultCalendarUrl: "",
  color: "",
  isDefault: false,
};

type Preset = {
  id: string;
  name: string;
  caldavUrl: string;
  hint?: string;
};

const PRESETS: Preset[] = [
  {
    id: "icloud",
    name: "iCloud",
    caldavUrl: "https://caldav.icloud.com",
    hint: "Use an Apple app-specific password (appleid.apple.com → Sign-In and Security).",
  },
  {
    id: "fastmail",
    name: "Fastmail",
    caldavUrl: "https://caldav.fastmail.com",
    hint: "Generate an app password at fastmail.com/settings/security/devicekey.",
  },
  {
    id: "nextcloud",
    name: "Nextcloud",
    caldavUrl: "https://your-nextcloud.example/remote.php/dav",
    hint: "Replace the host with your own Nextcloud instance.",
  },
  {
    id: "ovh",
    name: "OVH",
    caldavUrl: "https://dav.mail.ovh.net",
  },
  {
    id: "baikal",
    name: "Baïkal / generic",
    caldavUrl: "",
    hint: "Paste the full base URL provided by your CalDAV server.",
  },
];

export function CalendarAccountForm({
  mode,
  accountId,
  initial,
}: {
  mode: "create" | "edit";
  accountId?: string;
  initial?: Partial<CalendarAccountFormValues>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<CalendarAccountFormValues>({
    ...empty,
    ...initial,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<null | {
    caldav: { ok: boolean; calendarCount: number; error: string | null };
  }>(null);
  const [testing, setTesting] = useState(false);
  const [activePresetHint, setActivePresetHint] = useState<string | null>(null);

  function update<K extends keyof CalendarAccountFormValues>(
    key: K,
    v: CalendarAccountFormValues[K],
  ) {
    setValues((s) => ({ ...s, [key]: v }));
  }

  function applyPreset(id: string) {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    if (p.caldavUrl) update("caldavUrl", p.caldavUrl);
    setActivePresetHint(p.hint ?? null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const url =
        mode === "create"
          ? "/api/calendar-accounts"
          : `/api/calendar-accounts/${accountId}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const payload: Record<string, unknown> = {
        label: values.label,
        caldavUrl: values.caldavUrl,
        username: values.username,
        defaultCalendarUrl: values.defaultCalendarUrl || null,
        color: values.color || null,
        isDefault: values.isDefault,
      };
      if (mode === "create" || values.password) {
        payload.password = values.password;
      }
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ? JSON.stringify(body.error) : `HTTP ${res.status}`);
      }
      router.push("/calendars");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function testConnection() {
    if (!accountId) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/calendar-accounts/${accountId}/test`, {
        method: "POST",
      });
      const body = await res.json();
      setTestResult(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  }

  async function remove() {
    if (!accountId) return;
    if (!confirm("Delete this calendar account?")) return;
    const res = await fetch(`/api/calendar-accounts/${accountId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      router.push("/calendars");
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit}>
      {error && <div className="alert alert-error">{error}</div>}

      {mode === "create" && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Provider preset</h3>
          <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            Pre-fills the CalDAV base URL. tsdav auto-discovers the user&apos;s home calendar
            collections from there. Google Calendar requires OAuth and is not yet supported —
            use Fastmail / iCloud / Nextcloud with an app password.
          </p>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="btn btn-sm"
                onClick={() => applyPreset(p.id)}
              >
                {p.name}
              </button>
            ))}
          </div>
          {activePresetHint && (
            <div className="alert alert-info" style={{ marginTop: 12, fontSize: 13 }}>
              💡 {activePresetHint}
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 16 }}>General information</h3>
        <div className="field">
          <label>Label</label>
          <input
            className="input"
            value={values.label}
            onChange={(e) => update("label", e.target.value)}
            placeholder="Personal Fastmail"
            required
          />
        </div>
        <label className="checkbox-row" style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={values.isDefault}
            onChange={(e) => update("isDefault", e.target.checked)}
          />
          Default calendar account
        </label>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 16 }}>CalDAV connection</h3>
        <div className="field">
          <label>Server URL</label>
          <input
            className="input"
            type="url"
            value={values.caldavUrl}
            onChange={(e) => update("caldavUrl", e.target.value)}
            placeholder="https://caldav.fastmail.com"
            required
          />
          <p className="hint" style={{ marginTop: 4 }}>
            Base URL — the principal/home calendar collections are auto-discovered.
          </p>
        </div>
        <div className="field">
          <label>Username</label>
          <input
            className="input"
            value={values.username}
            onChange={(e) => update("username", e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>
            Password {mode === "edit" && <span className="hint">(leave empty to keep)</span>}
          </label>
          <input
            className="input"
            type="password"
            value={values.password}
            onChange={(e) => update("password", e.target.value)}
            autoComplete="new-password"
            required={mode === "create"}
          />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 16 }}>Optional</h3>
        <div className="field">
          <label>
            Pinned default calendar URL <span className="hint">(optional)</span>
          </label>
          <input
            className="input"
            type="url"
            value={values.defaultCalendarUrl}
            onChange={(e) => update("defaultCalendarUrl", e.target.value)}
            placeholder="https://…/calendars/user/personal/"
          />
        </div>
        <div className="field">
          <label>
            Display color <span className="hint">(optional, #RRGGBB)</span>
          </label>
          <input
            className="input"
            value={values.color}
            onChange={(e) => update("color", e.target.value)}
            placeholder="#3478f6"
            pattern="#[0-9a-fA-F]{6}"
          />
        </div>
      </div>

      {testResult && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Test result</h3>
          <div
            className={
              testResult.caldav.ok ? "alert alert-success" : "alert alert-error"
            }
          >
            CalDAV:{" "}
            {testResult.caldav.ok
              ? `OK — discovered ${testResult.caldav.calendarCount} calendar(s)`
              : testResult.caldav.error}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Saving…" : mode === "create" ? "Create" : "Save"}
          </button>
          {mode === "edit" && (
            <button type="button" className="btn" disabled={testing} onClick={testConnection}>
              {testing ? "Testing…" : "Test connection"}
            </button>
          )}
        </div>
        {mode === "edit" && (
          <button type="button" className="btn btn-danger" onClick={remove}>
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
