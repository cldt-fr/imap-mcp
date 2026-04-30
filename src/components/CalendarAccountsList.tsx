"use client";

import Link from "next/link";
import { useState } from "react";

type Account = {
  id: string;
  label: string;
  caldavUrl: string;
  username: string;
  isDefault: boolean;
};

type TestResult = {
  caldav: { ok: boolean; calendarCount: number; error: string | null };
};

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "done"; result: TestResult }
  | { status: "error"; message: string };

export function CalendarAccountsList({ accounts }: { accounts: Account[] }) {
  const [tests, setTests] = useState<Record<string, TestState>>({});

  async function runTest(id: string) {
    setTests((s) => ({ ...s, [id]: { status: "testing" } }));
    try {
      const res = await fetch(`/api/calendar-accounts/${id}/test`, {
        method: "POST",
      });
      if (!res.ok) {
        const text = await res.text();
        setTests((s) => ({
          ...s,
          [id]: { status: "error", message: text || `HTTP ${res.status}` },
        }));
        return;
      }
      const result: TestResult = await res.json();
      setTests((s) => ({ ...s, [id]: { status: "done", result } }));
    } catch (e) {
      setTests((s) => ({
        ...s,
        [id]: {
          status: "error",
          message: e instanceof Error ? e.message : String(e),
        },
      }));
    }
  }

  function StatusBadge({ t }: { t: TestState }) {
    if (t.status === "idle") return null;
    if (t.status === "testing")
      return (
        <span className="badge badge-muted">
          <span className="spinner" /> Testing…
        </span>
      );
    if (t.status === "error")
      return <span className="badge badge-danger">Error</span>;
    return t.result.caldav.ok ? (
      <span className="badge badge-success">
        ✓ {t.result.caldav.calendarCount} calendar(s)
      </span>
    ) : (
      <span className="badge badge-danger">CalDAV failed</span>
    );
  }

  return (
    <div className="stack">
      {accounts.map((a) => {
        const t = tests[a.id] ?? { status: "idle" as const };
        return (
          <div key={a.id} className="card card-hover">
            <div className="row row-between" style={{ gap: 16 }}>
              <Link
                href={`/calendars/${a.id}`}
                style={{
                  color: "inherit",
                  textDecoration: "none",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <div className="row" style={{ gap: 8 }}>
                  <strong>{a.label}</strong>
                  {a.isDefault && <span className="badge badge-soft">default</span>}
                  <StatusBadge t={t} />
                </div>
                <div className="muted" style={{ marginTop: 4, fontSize: 14 }}>
                  {a.username} · {a.caldavUrl}
                </div>
              </Link>
              <div className="row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={t.status === "testing"}
                  onClick={() => runTest(a.id)}
                >
                  {t.status === "testing" ? "Testing…" : "Test"}
                </button>
                <Link href={`/calendars/${a.id}`} className="btn btn-sm">
                  Edit
                </Link>
              </div>
            </div>

            {t.status === "done" && (
              <div className="stack stack-sm" style={{ marginTop: 14 }}>
                <div
                  className={
                    t.result.caldav.ok
                      ? "alert alert-success"
                      : "alert alert-error"
                  }
                >
                  <strong>CalDAV</strong> ·{" "}
                  {t.result.caldav.ok
                    ? `connection OK — ${t.result.caldav.calendarCount} calendar(s) discovered`
                    : t.result.caldav.error}
                </div>
              </div>
            )}

            {t.status === "error" && (
              <div className="alert alert-error" style={{ marginTop: 14 }}>
                Error: {t.message}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
