"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SignatureEditor } from "./SignatureEditor";

export interface AccountFormValues {
  label: string;
  email: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  imapPassword: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  signatureHtml: string;
  isDefault: boolean;
}

const empty: AccountFormValues = {
  label: "",
  email: "",
  imapHost: "",
  imapPort: 993,
  imapSecure: true,
  imapUser: "",
  imapPassword: "",
  smtpHost: "",
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: "",
  smtpPassword: "",
  signatureHtml: "",
  isDefault: false,
};

export function AccountForm({
  mode,
  accountId,
  initial,
}: {
  mode: "create" | "edit";
  accountId?: string;
  initial?: Partial<AccountFormValues>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<AccountFormValues>({ ...empty, ...initial });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<null | {
    imap: { ok: boolean; error: string | null };
    smtp: { ok: boolean; error: string | null };
  }>(null);
  const [testing, setTesting] = useState(false);

  function update<K extends keyof AccountFormValues>(key: K, v: AccountFormValues[K]) {
    setValues((s) => ({ ...s, [key]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const url = mode === "create" ? "/api/accounts" : `/api/accounts/${accountId}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const payload: Partial<AccountFormValues> = { ...values };
      if (mode === "edit" && !values.imapPassword) delete payload.imapPassword;
      if (mode === "edit" && !values.smtpPassword) delete payload.smtpPassword;
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ? JSON.stringify(body.error) : `HTTP ${res.status}`);
      }
      router.push("/accounts");
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
      const res = await fetch(`/api/accounts/${accountId}/test`, { method: "POST" });
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
    if (!confirm("Supprimer ce compte ?")) return;
    const res = await fetch(`/api/accounts/${accountId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/accounts");
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit}>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 16 }}>Informations générales</h3>
        <div className="field">
          <label>Libellé</label>
          <input
            className="input"
            value={values.label}
            onChange={(e) => update("label", e.target.value)}
            placeholder="Perso Gmail"
            required
          />
        </div>
        <div className="field">
          <label>Adresse email (expéditeur)</label>
          <input
            className="input"
            type="email"
            value={values.email}
            onChange={(e) => update("email", e.target.value)}
            required
          />
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <input
            type="checkbox"
            checked={values.isDefault}
            onChange={(e) => update("isDefault", e.target.checked)}
          />
          Compte par défaut
        </label>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 16 }}>IMAP (réception)</h3>
        <div className="grid-2">
          <div className="field">
            <label>Hôte</label>
            <input
              className="input"
              value={values.imapHost}
              onChange={(e) => update("imapHost", e.target.value)}
              placeholder="imap.gmail.com"
              required
            />
          </div>
          <div className="field">
            <label>Port</label>
            <input
              className="input"
              type="number"
              value={values.imapPort}
              onChange={(e) => update("imapPort", Number(e.target.value))}
              required
            />
          </div>
        </div>
        <div className="field">
          <label>Utilisateur</label>
          <input
            className="input"
            value={values.imapUser}
            onChange={(e) => update("imapUser", e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>Mot de passe {mode === "edit" && <span className="hint">(laisser vide pour conserver)</span>}</label>
          <input
            className="input"
            type="password"
            value={values.imapPassword}
            onChange={(e) => update("imapPassword", e.target.value)}
            autoComplete="new-password"
            required={mode === "create"}
          />
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={values.imapSecure}
            onChange={(e) => update("imapSecure", e.target.checked)}
          />
          TLS (SSL implicite)
        </label>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 16 }}>SMTP (envoi)</h3>
        <div className="grid-2">
          <div className="field">
            <label>Hôte</label>
            <input
              className="input"
              value={values.smtpHost}
              onChange={(e) => update("smtpHost", e.target.value)}
              placeholder="smtp.gmail.com"
              required
            />
          </div>
          <div className="field">
            <label>Port</label>
            <input
              className="input"
              type="number"
              value={values.smtpPort}
              onChange={(e) => update("smtpPort", Number(e.target.value))}
              required
            />
          </div>
        </div>
        <div className="field">
          <label>Utilisateur</label>
          <input
            className="input"
            value={values.smtpUser}
            onChange={(e) => update("smtpUser", e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>Mot de passe {mode === "edit" && <span className="hint">(laisser vide pour conserver)</span>}</label>
          <input
            className="input"
            type="password"
            value={values.smtpPassword}
            onChange={(e) => update("smtpPassword", e.target.value)}
            autoComplete="new-password"
            required={mode === "create"}
          />
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={values.smtpSecure}
            onChange={(e) => update("smtpSecure", e.target.checked)}
          />
          TLS (SSL implicite)
        </label>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 16 }}>Signature HTML</h3>
        <SignatureEditor
          value={values.signatureHtml}
          onChange={(html) => update("signatureHtml", html)}
        />
      </div>

      {testResult && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Résultat du test</h3>
          <div style={{ display: "flex", gap: 16, flexDirection: "column" }}>
            <div className={testResult.imap.ok ? "alert alert-success" : "alert alert-error"}>
              IMAP : {testResult.imap.ok ? "OK" : testResult.imap.error}
            </div>
            <div className={testResult.smtp.ok ? "alert alert-success" : "alert alert-error"}>
              SMTP : {testResult.smtp.ok ? "OK" : testResult.smtp.error}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Enregistrement…" : mode === "create" ? "Créer" : "Enregistrer"}
          </button>
          {mode === "edit" && (
            <button type="button" className="btn" disabled={testing} onClick={testConnection}>
              {testing ? "Test en cours…" : "Tester la connexion"}
            </button>
          )}
        </div>
        {mode === "edit" && (
          <button type="button" className="btn btn-danger" onClick={remove}>
            Supprimer
          </button>
        )}
      </div>
    </form>
  );
}
