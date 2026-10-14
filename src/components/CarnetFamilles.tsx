"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { classeEn, prenomEleve, type Eleve } from "@/lib/eleves";

export type FamilleCarnet = {
  id: string;
  nom: string;
  adresse: string | null;
  cp_ville: string | null;
} & Record<`parent${1 | 2}_${"prenom" | "nom" | "telephone" | "courriel"}`, string | null>;
export type PropositionFamille = { id: string; famille_id: string; champ: string; ancien: string | null; nouveau: string | null; propose_le: string };

const CHAMPS: { cle: keyof FamilleCarnet; label: string; type?: string }[] = [
  { cle: "parent1_prenom", label: "Parent 1 · prénom" },
  { cle: "parent1_nom", label: "Parent 1 · nom" },
  { cle: "parent1_telephone", label: "Parent 1 · téléphone", type: "tel" },
  { cle: "parent1_courriel", label: "Parent 1 · courriel", type: "email" },
  { cle: "parent2_prenom", label: "Parent 2 · prénom" },
  { cle: "parent2_nom", label: "Parent 2 · nom" },
  { cle: "parent2_telephone", label: "Parent 2 · téléphone", type: "tel" },
  { cle: "parent2_courriel", label: "Parent 2 · courriel", type: "email" },
  { cle: "adresse", label: "Adresse" },
  { cle: "cp_ville", label: "Code postal et ville" },
];
export const LIBELLE_CHAMP = Object.fromEntries(CHAMPS.map((c) => [c.cle, c.label])) as Record<string, string>;
const saisie = "w-full rounded-md border border-border bg-background px-2 py-1 text-[13px] outline-none focus:border-accent";

/**
 * Familles de l'école dans le Carnet d'adresses (dossiers familles : parents, téléphones, courriels, adresse, enfants).
 * Par défaut, les familles de l'année en cours. Modification : directe, sauf pour la Directrice sur une famille de
 * l'année, où elle est proposée à la famille (validation dans son Espace famille).
 */
export default function CarnetFamilles({
  familles,
  eleves,
  propositions,
  annee,
  peutModifier,
  directrice,
}: {
  familles: FamilleCarnet[];
  eleves: (Eleve & { famille_id: string })[];
  propositions: PropositionFamille[];
  annee: string;
  peutModifier: boolean;
  directrice: boolean;
}) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [filtre, setFiltre] = useState<"annee" | "anciennes" | "toutes">("annee");
  const [recherche, setRecherche] = useState("");
  const [edition, setEdition] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [occupe, setOccupe] = useState(false);

  const enfantsDe = (id: string) => eleves.filter((e) => e.famille_id === id);
  const actuelle = (id: string) => enfantsDe(id).some((e) => classeEn(e, annee) !== null);
  const nb = { annee: familles.filter((f) => actuelle(f.id)).length, anciennes: familles.filter((f) => !actuelle(f.id)).length, toutes: familles.length };
  const q = recherche.trim().toLowerCase();
  const liste = familles
    .filter((f) => (filtre === "annee" ? actuelle(f.id) : filtre === "anciennes" ? !actuelle(f.id) : true))
    .filter((f) => !q || [f.nom, f.parent1_prenom, f.parent1_nom, f.parent2_prenom, f.parent2_nom, f.parent1_courriel, f.parent2_courriel, f.cp_ville, ...enfantsDe(f.id).map((e) => e.prenom)].some((v) => (v ?? "").toLowerCase().includes(q)))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

  const ouvrir = (f: FamilleCarnet) => {
    setEdition(f.id);
    setMessage(null);
    setBrouillon(Object.fromEntries(CHAMPS.map((c) => [c.cle, (f[c.cle] as string | null) ?? ""])));
  };
  async function enregistrer(f: FamilleCarnet) {
    setOccupe(true);
    const { data, error } = await sb.rpc("famille_modifier_bureau", { p_famille: f.id, p_infos: brouillon });
    setOccupe(false);
    if (error) return setMessage({ ok: false, texte: `Échec : ${error.message}` });
    setEdition(null);
    setMessage({
      ok: true,
      texte:
        data === "propose"
          ? `Famille ${f.nom} : modification proposée à la famille, qui la validera dans son Espace famille.`
          : data === "applique"
            ? `Famille ${f.nom} : coordonnées enregistrées.`
            : "Aucun changement.",
    });
    router.refresh();
  }

  const parent = (f: FamilleCarnet, k: 1 | 2) => {
    const nom = [f[`parent${k}_prenom`], f[`parent${k}_nom`]].filter(Boolean).join(" ");
    const tel = f[`parent${k}_telephone`];
    const mail = f[`parent${k}_courriel`];
    if (!nom && !tel && !mail) return null;
    return (
      <div className="text-[12.5px]">
        <span className="font-medium">{nom || `Parent ${k}`}</span>
        {tel && (
          <a href={`tel:${tel.replace(/\s/g, "")}`} className="ml-2 text-accent hover:underline">
            {tel}
          </a>
        )}
        {mail && (
          <a href={`mailto:${mail}`} className="ml-2 break-all text-accent hover:underline">
            {mail}
          </a>
        )}
      </div>
    );
  };

  return (
    <section className="mb-8 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">Familles de l&apos;école</h2>
        <div className="flex gap-1 rounded-lg bg-surface-2 p-1 text-[13px]">
          {(
            [
              ["annee", `Année ${annee}`],
              ["anciennes", "Anciennes familles"],
              ["toutes", "Toutes"],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setFiltre(v)} className={`rounded-md px-2.5 py-1 font-medium ${filtre === v ? "bg-surface text-accent shadow-sm" : "text-muted hover:text-foreground"}`}>
              {l} <span className="text-[11px] font-normal opacity-80">({nb[v]})</span>
            </button>
          ))}
        </div>
        <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher une famille, un parent, un enfant…" className={`${saisie} ml-auto max-w-xs`} />
      </div>
      {directrice && <p className="text-[12px] text-muted">Pour une famille de l&apos;année en cours, vos modifications sont proposées à la famille, qui les valide dans son Espace famille.</p>}
      {message && <p className={`rounded-lg px-3 py-2 text-[13px] ${message.ok ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"}`}>{message.texte}</p>}

      <div className="grid gap-2 md:grid-cols-2">
        {liste.map((f) => {
          const enfants = enfantsDe(f.id);
          const enAttente = propositions.filter((p) => p.famille_id === f.id);
          return (
            <div key={f.id} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-semibold">Famille {f.nom}</span>
                {!actuelle(f.id) && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">Ancienne famille</span>}
                {peutModifier && edition !== f.id && (
                  <button type="button" onClick={() => ouvrir(f)} className="ml-auto text-[12.5px] text-accent hover:underline">
                    Modifier
                  </button>
                )}
              </div>
              {enfants.length > 0 && (
                <div className="mt-0.5 text-[12px] text-muted">
                  Enfants :{" "}
                  {enfants
                    .map((e) => {
                      const c = classeEn(e, annee);
                      return `${prenomEleve(e)}${c ? ` (${c})` : ""}`;
                    })
                    .join(", ")}
                </div>
              )}
              {edition === f.id ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {CHAMPS.map((c) => (
                    <label key={c.cle} className="grid gap-0.5 text-[11.5px] text-muted">
                      {c.label}
                      <input type={c.type ?? "text"} value={brouillon[c.cle] ?? ""} onChange={(e) => setBrouillon({ ...brouillon, [c.cle]: e.target.value })} className={saisie} />
                    </label>
                  ))}
                  <div className="flex gap-2 sm:col-span-2">
                    <button type="button" disabled={occupe} onClick={() => enregistrer(f)} className="rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-fg disabled:opacity-50">
                      {directrice && actuelle(f.id) ? "Proposer à la famille" : "Enregistrer"}
                    </button>
                    <button type="button" onClick={() => setEdition(null)} className="rounded-lg px-3 py-1.5 text-[13px] hover:bg-surface-2">
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-1.5 space-y-0.5">
                  {parent(f, 1)}
                  {parent(f, 2)}
                  {(f.adresse || f.cp_ville) && <div className="text-[12.5px] text-muted">{[f.adresse, f.cp_ville].filter(Boolean).join(", ")}</div>}
                </div>
              )}
              {enAttente.length > 0 && (
                <div className="mt-2 rounded-lg bg-gold-soft/60 px-2 py-1.5 text-[12px]">
                  <div className="font-medium text-gold">En attente de validation par la famille</div>
                  {enAttente.map((p) => (
                    <div key={p.id}>
                      {LIBELLE_CHAMP[p.champ] ?? p.champ} : <span className="line-through opacity-60">{p.ancien || "—"}</span> → <strong>{p.nouveau || "(vide)"}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {!liste.length && <p className="text-sm text-muted">Aucune famille.</p>}
      </div>
    </section>
  );
}
