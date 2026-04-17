"use client";

import Link from "next/link";
import { useState } from "react";

type Account = {
  id: string;
  label: string;
  email: string;
  imapHost: string;
  isDefault: boolean;
};

type TestResult = {
  imap: { ok: boolean; error: string | null };
  smtp: { ok: boolean; error: string | null };
};

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "done"; result: TestResult }
  | { status: "error"; message: string };

export function AccountsList({ accounts }: { accounts: Account[] }) {
  const [tests, setTests] = useState<Record<string, TestState>>({});

  async function runTest(id: string) {
    setTests((s) => ({ ...s, [id]: { status: "testing" } }));
    try {
      const res = await fetch(`/api/accounts/${id}/test`, { method: "POST" });
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
          <span className="spinner" /> Test…
        </span>
      );
    if (t.status === "error")
      return <span className="badge badge-danger">Erreur</span>;
    const { imap, smtp } = t.result;
    if (imap.ok && smtp.ok)
      return <span className="badge badge-success">✓ Opérationnel</span>;
    if (!imap.ok && !smtp.ok)
      return <span className="badge badge-danger">IMAP + SMTP KO</span>;
    if (!imap.ok) return <span className="badge badge-danger">IMAP KO</span>;
    return <span className="badge badge-danger">SMTP KO</span>;
  }

  return (
    <div className="stack">
      {accounts.map((a) => {
        const t = tests[a.id] ?? { status: "idle" as const };
        return (
          <div key={a.id} className="card card-hover">
            <div className="row row-between" style={{ gap: 16 }}>
              <Link
                href={`/accounts/${a.id}`}
                style={{
                  color: "inherit",
                  textDecoration: "none",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <div className="row" style={{ gap: 8 }}>
                  <strong>{a.label}</strong>
                  {a.isDefault && <span className="badge badge-soft">par défaut</span>}
                  <StatusBadge t={t} />
                </div>
                <div className="muted" style={{ marginTop: 4, fontSize: 14 }}>
                  {a.email} · {a.imapHost}
                </div>
              </Link>
              <div className="row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={t.status === "testing"}
                  onClick={() => runTest(a.id)}
                >
                  {t.status === "testing" ? "Test…" : "Tester"}
                </button>
                <Link href={`/accounts/${a.id}`} className="btn btn-sm">
                  Modifier
                </Link>
              </div>
            </div>

            {t.status === "done" && (
              <div className="stack stack-sm" style={{ marginTop: 14 }}>
                <div
                  className={
                    t.result.imap.ok ? "alert alert-success" : "alert alert-error"
                  }
                >
                  <strong>IMAP</strong> · {t.result.imap.ok ? "connexion OK" : t.result.imap.error}
                </div>
                <div
                  className={
                    t.result.smtp.ok ? "alert alert-success" : "alert alert-error"
                  }
                >
                  <strong>SMTP</strong> · {t.result.smtp.ok ? "connexion OK" : t.result.smtp.error}
                </div>
                {!t.result.smtp.ok &&
                  t.result.smtp.error?.includes("wrong version number") && (
                    <div className="alert alert-warning">
                      💡 Port/SSL incohérent. Essaie <strong>465 + SSL/TLS</strong> ou{" "}
                      <strong>587 sans SSL/TLS</strong>.
                    </div>
                  )}
              </div>
            )}

            {t.status === "error" && (
              <div className="alert alert-error" style={{ marginTop: 14 }}>
                Erreur : {t.message}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
