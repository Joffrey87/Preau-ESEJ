"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { inputCls } from "./GestionComptes";

export type CoordonneesInit = {
  adresse: string | null;
  cp_ville: string | null;
  parent1_prenom: string | null;
  parent1_nom: string | null;
  parent1_telephone: string | null;
  parent1_courriel: string | null;
  parent2_prenom: string | null;
  parent2_nom: string | null;
  parent2_telephone: string | null;
  parent2_courriel: string | null;
};

type Cle = keyof CoordonneesInit;

/** Informations à confirmer une à une lors de la revalidation annuelle (coche verte). */
const A_CONFIRMER: { k: Cle; l: string }[] = [
  { k: "adresse", l: "adresse" },
  { k: "parent1_telephone", l: "téléphone de Monsieur" },
  { k: "parent2_telephone", l: "téléphone de Madame" },
  { k: "parent1_courriel", l: "courriel de Monsieur" },
  { k: "parent2_courriel", l: "courriel de Madame" },
];

const vide = (v: string | null | undefined) => !(v ?? "").trim();

/**
 * Coordonnées d'une famille, modifiables par la famille elle-même. L'enregistrement s'applique tout de suite
 * (le bureau en est alerté). Pendant la campagne annuelle (1er août → 30 septembre), la famille coche chaque
 * information confirmée (adresse, téléphones et courriels des deux parents) puis valide : l'alerte disparaît.
 */
export default function CoordonneesFamille({
  init,
  campagne,
  revalide,
  lectureSeule,
}: {
  init: CoordonneesInit;
  /** Campagne de revalidation en cours (année), sinon null. */
  campagne: number | null;
  /** La famille a déjà revalidé pour cette campagne. */
  revalide: boolean;
  /** Aperçu du bureau : rien ne s'enregistre. */
  lectureSeule: boolean;
}) {
  const router = useRouter();
  const [f, setF] = useState<CoordonneesInit>(init);
  const [coches, setCoches] = useState<Set<Cle>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; t: string } | null>(null);

  const set = (k: Cle, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    // Une information modifiée doit être confirmée de nouveau.
    setCoches((p) => {
      const n = new Set(p);
      n.delete(k);
      return n;
    });
  };
  const bascule = (k: Cle) =>
    setCoches((p) => {
      const n = new Set(p);
      if (!n.delete(k)) n.add(k);
      return n;
    });

  // Informations renseignées qu'il reste à confirmer ; adresse, téléphone et courriel de Monsieur sont obligatoires.
  const obligatoires: Cle[] = ["adresse", "parent1_telephone", "parent1_courriel"];
  const manquantes = obligatoires.filter((k) => vide(f[k]));
  const aCocher = A_CONFIRMER.filter((c) => !vide(f[c.k]));
  const toutCoche = aCocher.every((c) => coches.has(c.k));
  const peutValider = campagne !== null && !revalide && manquantes.length === 0 && toutCoche;

  async function enregistrer(valider: boolean) {
    if (lectureSeule) return setMessage({ ok: false, t: "Aperçu : l'enregistrement est désactivé." });
    setBusy(true);
    setMessage(null);
    const { error } = await createClient().rpc("famille_enregistrer", { p_infos: f, p_revalide: valider });
    setBusy(false);
    if (error) return setMessage({ ok: false, t: "Enregistrement impossible : " + error.message });
    setMessage({ ok: true, t: valider ? "Merci, vos informations sont validées." : "Vos informations sont enregistrées." });
    router.refresh();
  }

  const champ = (k: Cle, label: string, type = "text") => {
    const confirmable = A_CONFIRMER.some((c) => c.k === k);
    const coche = coches.has(k);
    return (
      <label className="block text-xs text-muted">
        {label}
        <span className="mt-0.5 flex items-center gap-2">
          <input
            type={type}
            value={f[k] ?? ""}
            onChange={(e) => set(k, e.target.value)}
            className={`${inputCls} flex-1`}
            readOnly={lectureSeule}
          />
          {campagne !== null && !revalide && confirmable && (
            <button
              type="button"
              onClick={() => bascule(k)}
              disabled={vide(f[k])}
              aria-pressed={coche}
              title={coche ? "Information confirmée" : "Je confirme que cette information est à jour"}
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-base transition ${
                coche ? "border-positive bg-positive/15 text-positive" : "border-border text-muted/50 hover:bg-surface-2"
              } disabled:opacity-40`}
            >
              ✓
            </button>
          )}
        </span>
      </label>
    );
  };

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="mb-1 text-sm font-semibold">Coordonnées</h2>
      {campagne !== null && !revalide && (
        <p className="mb-3 rounded-lg border border-gold/40 bg-gold/15 px-3 py-2 text-xs">
          Merci de vérifier vos informations avant le 30 septembre : corrigez-les si besoin, puis cochez <span className="font-semibold text-positive">✓</span>{" "}
          l&apos;adresse, le téléphone et le courriel de Monsieur et de Madame, et validez.
        </p>
      )}
      {campagne !== null && revalide && (
        <p className="mb-3 rounded-lg bg-positive/10 px-3 py-2 text-xs text-positive">✓ Vos informations ont été validées pour cette année. Merci !</p>
      )}
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {champ("adresse", "Adresse")}
          {champ("cp_ville", "Code postal et ville")}
        </div>
        {([1, 2] as const).map((n) => (
          <div key={n} className="rounded-lg border border-border p-3">
            <div className="mb-2 text-xs font-semibold">{n === 1 ? "Monsieur" : "Madame"}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {champ(`parent${n}_prenom` as Cle, "Prénom")}
              {champ(`parent${n}_nom` as Cle, "Nom")}
              {champ(`parent${n}_telephone` as Cle, "Téléphone", "tel")}
              {champ(`parent${n}_courriel` as Cle, "Courriel", "email")}
            </div>
          </div>
        ))}
      </div>
      {message && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-xs ${message.ok ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"}`}>{message.t}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {campagne !== null && !revalide && manquantes.length > 0 && (
          <span className="mr-auto text-xs text-muted">À renseigner pour valider : adresse, téléphone et courriel de Monsieur.</span>
        )}
        <button
          type="button"
          onClick={() => void enregistrer(false)}
          disabled={busy || lectureSeule}
          className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-2 disabled:opacity-50"
        >
          Enregistrer
        </button>
        {campagne !== null && !revalide && (
          <button
            type="button"
            onClick={() => void enregistrer(true)}
            disabled={busy || lectureSeule || !peutValider}
            title={peutValider ? "" : "Cochez ✓ chaque information renseignée"}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            Valider mes informations
          </button>
        )}
      </div>
    </section>
  );
}
