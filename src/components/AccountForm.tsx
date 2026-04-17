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

type Preset = {
  id: string;
  name: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  hint?: string;
};

const PRESETS: Preset[] = [
  {
    id: "gmail",
    name: "Gmail / Workspace",
    imapHost: "imap.gmail.com",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    smtpSecure: true,
    hint: "Utilise un mot de passe d'application : myaccount.google.com/apppasswords",
  },
  {
    id: "outlook",
    name: "Outlook / Microsoft 365",
    imapHost: "outlook.office365.com",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    smtpSecure: false,
  },
  {
    id: "icloud",
    name: "iCloud",
    imapHost: "imap.mail.me.com",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "smtp.mail.me.com",
    smtpPort: 587,
    smtpSecure: false,
    hint: "Nécessite un mot de passe d'application Apple.",
  },
  {
    id: "yahoo",
    name: "Yahoo Mail",
    imapHost: "imap.mail.yahoo.com",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "smtp.mail.yahoo.com",
    smtpPort: 465,
    smtpSecure: true,
  },
  {
    id: "fastmail",
    name: "Fastmail",
    imapHost: "imap.fastmail.com",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "smtp.fastmail.com",
    smtpPort: 465,
    smtpSecure: true,
  },
  {
    id: "ovh",
    name: "OVH",
    imapHost: "ssl0.ovh.net",
    imapPort: 993,
    imapSecure: true,
    smtpHost: "ssl0.ovh.net",
    smtpPort: 465,
    smtpSecure: true,
  },
];

function portSecureWarning(port: number, secure: boolean): string | null {
  if (secure && (port === 587 || port === 25)) {
    return `Port ${port} avec SSL/TLS coché : probablement incorrect. Décoche SSL/TLS (STARTTLS) ou passe en 465.`;
  }
  if (!secure && port === 465) {
    return "Port 465 sans SSL/TLS : probablement incorrect. Coche SSL/TLS.";
  }
  return null;
}

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

  function applyPreset(id: string) {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setValues((s) => ({
      ...s,
      imapHost: p.imapHost,
      imapPort: p.imapPort,
      imapSecure: p.imapSecure,
      smtpHost: p.smtpHost,
      smtpPort: p.smtpPort,
      smtpSecure: p.smtpSecure,
    }));
  }

  const imapWarn = portSecureWarning(values.imapPort, values.imapSecure);
  const smtpWarn = portSecureWarning(values.smtpPort, values.smtpSecure);

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

      {mode === "create" && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Préréglage fournisseur</h3>
          <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            Pré-remplit hôtes, ports et SSL/TLS. Tu pourras ajuster ensuite.
          </p>
          <div className="row" style={{ gap: 8 }}>
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
        </div>
      )}

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
        <label className="checkbox-row" style={{ marginTop: 8 }}>
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
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={values.imapSecure}
            onChange={(e) => update("imapSecure", e.target.checked)}
          />
          SSL/TLS implicite (port 993 typiquement)
        </label>
        {imapWarn && (
          <div className="alert alert-warning" style={{ marginTop: 12 }}>
            ⚠️ {imapWarn}
          </div>
        )}
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
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={values.smtpSecure}
            onChange={(e) => update("smtpSecure", e.target.checked)}
          />
          SSL/TLS implicite (port 465) — laisser décoché pour STARTTLS (587)
        </label>
        {smtpWarn && (
          <div className="alert alert-warning" style={{ marginTop: 12 }}>
            ⚠️ {smtpWarn}
          </div>
        )}
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
