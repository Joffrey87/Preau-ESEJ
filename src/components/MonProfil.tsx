"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Field, inputCls } from "./GestionComptes";

// Chaque rôle est un compte partagé, mais la personne qui l'utilise peut
// renseigner son prénom/nom (stockés dans les métadonnées du compte). Ils
// s'affichent alors à l'accueil (« Bonjour Joffrey ») et dans la barre latérale.
export default function MonProfil({
  prenom,
  nom,
  roleLabel,
}: {
  prenom: string;
  nom: string;
  roleLabel: string;
}) {
  const router = useRouter();
  const [f, setF] = useState({ prenom, nom });
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({
      data: { prenom: f.prenom.trim() || null, nom: f.nom.trim() || null },
    });
    setSaving(false);
    if (err) {
      setError("Enregistrement impossible : " + err.message);
      return;
    }
    setOk(true);
    router.refresh();
  }

  return (
    <section>
      <div className="mb-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Mon profil</h2>
        <p className="mt-1 text-xs text-muted">
          Rôle <span className="font-medium text-foreground">{roleLabel}</span> — indiquez qui utilise ce compte.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Prénom">
            <input
              type="text"
              value={f.prenom}
              onChange={(e) => {
                setF((p) => ({ ...p, prenom: e.target.value }));
                setOk(false);
              }}
              className={inputCls}
              placeholder="Ex. Jean"
            />
          </Field>
          <Field label="Nom">
            <input
              type="text"
              value={f.nom}
              onChange={(e) => {
                setF((p) => ({ ...p, nom: e.target.value }));
                setOk(false);
              }}
              className={inputCls}
              placeholder="Ex. Dupont"
            />
          </Field>
        </div>

        {error && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{error}</p>}
        <div className="flex items-center justify-end gap-3">
          {ok && <span className="text-sm text-positive">Enregistré ✓</span>}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </section>
  );
}
