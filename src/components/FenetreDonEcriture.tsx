"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Modal, Field, inputCls } from "./GestionComptes";
import LierDonAEcriture from "@/components/LierDonAEcriture";
import type { Don } from "@/components/GestionDons";
import { useCoffre } from "@/components/CoffreProvider";
import { LIBELLE_DON, dechiffrerLibellesDon, texteDonateur } from "@/lib/libelleDon";
import { journaliser, nouveauLot, extraire } from "@/lib/journalOperations";
import { nomDonateur } from "@/lib/statutDon";
import { formatDate, formatEuros } from "@/lib/format";

type Categorie = { id: string; nom: string; type: "recette" | "depense" };
type Compte = { id: string; nom: string };
type Exercice = { id: string; libelle: string };

type Ecriture = {
  id: string;
  parent_id: string | null;
  date_operation: string;
  libelle: string;
  libelle_origine: string | null;
  libelle_origine_chiffre: string | null;
  montant: number;
  type: "recette" | "depense";
  mode_paiement: string | null;
  categorie_id: string | null;
  compte_id: string | null;
  exercice_id: string | null;
  est_ventilee: boolean;
  a_verifier: string | null;
};

const COLONNES =
  "id, parent_id, date_operation, libelle, libelle_origine, libelle_origine_chiffre, montant, type, mode_paiement, categorie_id, compte_id, exercice_id, est_ventilee, a_verifier";

const MODES = [
  { v: "virement", l: "Virement" },
  { v: "cheque", l: "Chèque" },
  { v: "carte", l: "Carte" },
  { v: "especes", l: "Espèces" },
  { v: "prelevement", l: "Prélèvement" },
  { v: "autre", l: "Autre" },
];

/**
 * Fenêtre ouverte en cliquant sur la ligne d'un don : l'écriture comptable concernée (la sous-écriture « fille » du don
 * et la ligne bancaire « mère » qui la porte), modifiables ici, avec le détail du lien entre le don et l'écriture.
 */
export default function FenetreDonEcriture({
  don,
  dons,
  operationsLiees,
  onFermer,
  onModifierDon,
}: {
  don: Don;
  dons: Don[];
  operationsLiees: Set<string>;
  onFermer: () => void;
  /** Ouvre le formulaire du don lui-même (identité, reçu…). */
  onModifierDon: () => void;
}) {
  const router = useRouter();
  const coffre = useCoffre();
  const [fille, setFille] = useState<Ecriture | null>(null);
  const [mere, setMere] = useState<Ecriture | null>(null);
  const [soeurs, setSoeurs] = useState<Ecriture[]>([]);
  const [categories, setCategories] = useState<Categorie[]>([]);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [charge, setCharge] = useState(false);
  const [intitule, setIntitule] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const opId = don.operation_id ?? null;

  // Écriture reliée, sa mère et les autres filles de la mère ; listes de choix.
  useEffect(() => {
    let annule = false;
    (async () => {
      const supabase = createClient();
      const [cats, cpts, exos] = await Promise.all([
        supabase.from("categories").select("id, nom, type").eq("archive", false).order("type").order("ordre").order("nom"),
        supabase.from("comptes").select("id, nom").eq("archive", false).order("ordre"),
        supabase.from("exercices").select("id, libelle").order("date_debut", { ascending: false }),
      ]);
      let f: Ecriture | null = null;
      let m: Ecriture | null = null;
      let s: Ecriture[] = [];
      if (opId) {
        const { data } = await supabase.from("operations").select(COLONNES).eq("id", opId).maybeSingle();
        f = (data as unknown as Ecriture | null) ?? null;
        if (f?.parent_id) {
          const [{ data: dm }, { data: ds }] = await Promise.all([
            supabase.from("operations").select(COLONNES).eq("id", f.parent_id).maybeSingle(),
            supabase.from("operations").select(COLONNES).eq("parent_id", f.parent_id).order("date_operation"),
          ]);
          m = (dm as unknown as Ecriture | null) ?? null;
          s = ((ds ?? []) as unknown as Ecriture[]).filter((x) => x.id !== f!.id);
        }
      }
      if (annule) return;
      setCategories((cats.data ?? []) as Categorie[]);
      setComptes((cpts.data ?? []) as Compte[]);
      setExercices((exos.data ?? []) as Exercice[]);
      setFille(f);
      setMere(m);
      setSoeurs(s);
      setCharge(true);
    })();
    return () => {
      annule = true;
    };
  }, [opId, version]);

  // Intitulé bancaire du don (chiffré avec le coffre) : de quoi reconnaître le tireur.
  useEffect(() => {
    if (!fille) return;
    let annule = false;
    (async () => {
      const l = await dechiffrerLibellesDon(coffre.dechiffrer, fille.libelle_origine_chiffre);
      const t = [texteDonateur(l), fille.libelle_origine].filter(Boolean).join(" · ");
      if (!annule) setIntitule(t || null);
    })();
    return () => {
      annule = true;
    };
  }, [fille, coffre.dechiffrer, coffre.estOuvert]);

  const nom = nomDonateur(don);
  const ecartMontant = fille ? Number(don.montant) - Number(fille.montant) : 0;
  const ecartJours = fille
    ? Math.round(Math.abs(new Date(`${don.date_don}T12:00:00`).getTime() - new Date(`${fille.date_operation}T12:00:00`).getTime()) / 86400000)
    : 0;

  return (
    <Modal title="Don et écriture comptable" onClose={onFermer} fermerAuClicExterieur>
      <div className="max-h-[78vh] space-y-4 overflow-y-auto pr-1">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <span>
            Don du <strong>{formatDate(don.date_don)}</strong> de <strong>{formatEuros(Number(don.montant))}</strong>
            {nom ? <> — {nom}</> : null}
          </span>
          <button type="button" onClick={onModifierDon} className="text-xs font-medium text-accent hover:underline">
            Modifier la fiche du don…
          </button>
        </div>

        {/* Détail du lien : reliée ou non, et concordance. */}
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Lien avec la comptabilité</h3>
          {fille && (
            <ul className="mb-2 space-y-0.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs">
              <Concordance ok={Math.abs(ecartMontant) < 0.005} bon={`Montant identique (${formatEuros(Number(fille.montant))})`}
                mauvais={`Montant différent : don ${formatEuros(Number(don.montant))}, écriture ${formatEuros(Number(fille.montant))} (écart ${formatEuros(Math.abs(ecartMontant))})`} />
              <Concordance ok={ecartJours <= 3} souple={ecartJours <= 35}
                bon={ecartJours === 0 ? "Même date" : `Date proche (${ecartJours} j d'écart)`}
                mauvais={`Date éloignée : don du ${formatDate(don.date_don)}, écriture du ${formatDate(fille.date_operation)} (${ecartJours} j)`} />
              {intitule && (
                <li className="text-muted">
                  Intitulé bancaire : <span className="text-foreground">{intitule}</span>
                </li>
              )}
              <li className="text-muted">
                {mere
                  ? "L'écriture du don est une sous-écriture (fille) d'une ligne bancaire ventilée."
                  : "L'écriture du don est une ligne bancaire entière (non ventilée)."}
              </li>
            </ul>
          )}
          <LierDonAEcriture don={don} operationsLiees={operationsLiees} dons={dons} />
        </section>

        {opId && !charge && <p className="text-sm text-muted">Chargement de l&apos;écriture…</p>}

        {opId && charge && !fille && (
          <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">L&apos;écriture reliée est introuvable (supprimée ?).</p>
        )}

        {mere && (
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Écriture mère (ligne bancaire)</h3>
            <EditeurEcriture
              key={mere.id}
              ecriture={mere}
              categories={categories}
              comptes={comptes}
              exercices={exercices}
              coffreOuvert={coffre.estOuvert}
              donLie={null}
              complement={
                <p className="text-xs text-muted">
                  Ventilée en {soeurs.length + 1} sous-écriture{soeurs.length > 0 ? "s" : ""} : celle de ce don
                  {soeurs.length > 0 && (
                    <>
                      , puis {soeurs.map((x) => `${formatEuros(Number(x.montant))}${x.libelle ? ` (${x.libelle})` : ""}`).join(", ")}
                    </>
                  )}
                  . Reste à ventiler : {formatEuros(Number(mere.montant) - Number(fille?.montant ?? 0) - soeurs.reduce((s, x) => s + Number(x.montant), 0))}.
                </p>
              }
              onEnregistre={() => {
                setVersion((v) => v + 1);
                router.refresh();
              }}
            />
          </section>
        )}

        {fille && (
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {mere ? "Écriture fille (celle du don)" : "Écriture du don"}
            </h3>
            <EditeurEcriture
              key={fille.id}
              ecriture={fille}
              categories={categories}
              comptes={comptes}
              exercices={exercices}
              coffreOuvert={coffre.estOuvert}
              donLie={don}
              onEnregistre={() => {
                setVersion((v) => v + 1);
                router.refresh();
              }}
            />
          </section>
        )}
      </div>
    </Modal>
  );
}

function Concordance({ ok, souple = false, bon, mauvais }: { ok: boolean; souple?: boolean; bon: string; mauvais: string }) {
  const ton = ok ? "text-positive" : souple ? "text-gold" : "text-negative";
  return (
    <li className={ton}>
      {ok ? "✓" : souple ? "≈" : "✗"} {ok || souple ? bon : mauvais}
    </li>
  );
}

/** Formulaire d'une écriture (mère ou fille) : enregistrement consigné au journal, comme dans Comptabilité. */
function EditeurEcriture({
  ecriture,
  categories,
  comptes,
  exercices,
  coffreOuvert,
  donLie,
  complement,
  onEnregistre,
}: {
  ecriture: Ecriture;
  categories: Categorie[];
  comptes: Compte[];
  exercices: Exercice[];
  coffreOuvert: boolean;
  donLie: Don | null;
  complement?: React.ReactNode;
  onEnregistre: () => void;
}) {
  const [f, setF] = useState({
    date_operation: ecriture.date_operation,
    libelle: ecriture.libelle,
    montant: String(ecriture.montant),
    categorie_id: ecriture.categorie_id ?? "",
    compte_id: ecriture.compte_id ?? "",
    mode_paiement: ecriture.mode_paiement ?? "",
    exercice_id: ecriture.exercice_id ?? "",
    a_verifier: ecriture.a_verifier ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const set = (k: keyof typeof f, v: string) => {
    setOk(false);
    setF((p) => ({ ...p, [k]: v }));
  };

  const catDon = useMemo(() => categories.find((c) => c.nom === "Don")?.id ?? null, [categories]);
  const estDon = (f.categorie_id || null) === catDon;
  const modifie =
    f.date_operation !== ecriture.date_operation ||
    f.libelle !== ecriture.libelle ||
    Number(f.montant) !== Number(ecriture.montant) ||
    f.categorie_id !== (ecriture.categorie_id ?? "") ||
    f.compte_id !== (ecriture.compte_id ?? "") ||
    f.mode_paiement !== (ecriture.mode_paiement ?? "") ||
    f.exercice_id !== (ecriture.exercice_id ?? "") ||
    f.a_verifier !== (ecriture.a_verifier ?? "");

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    const montant = Number(f.montant);
    if (!f.libelle.trim()) return setErreur("Le libellé est obligatoire.");
    if (!Number.isFinite(montant) || montant <= 0) return setErreur("Montant invalide.");
    if (
      donLie &&
      ecriture.categorie_id === catDon &&
      (f.categorie_id || null) !== catDon &&
      !window.confirm("Cette écriture est reliée à ce don. En changeant sa catégorie, le don sera délié (il restera dans l'onglet Dons). Continuer ?")
    ) {
      return;
    }
    if (
      donLie &&
      Math.abs(Number(donLie.montant) - montant) >= 0.005 &&
      Math.abs(Number(donLie.montant) - Number(ecriture.montant)) < 0.005 &&
      !window.confirm(`Le don est de ${formatEuros(Number(donLie.montant))} : avec ${formatEuros(montant)}, les deux montants ne correspondront plus (le don n'est pas modifié). Continuer ?`)
    ) {
      return;
    }
    setSaving(true);
    // Écriture « Don » : le libellé reste neutre, il ne se modifie pas ici (le nom est chiffré dans le libellé d'origine).
    const champs = {
      date_operation: f.date_operation,
      libelle: estDon ? ecriture.libelle : f.libelle.trim(),
      compte_id: f.compte_id || null,
      mode_paiement: f.mode_paiement || null,
      exercice_id: f.exercice_id || null,
      montant,
      categorie_id: f.categorie_id || null,
      a_verifier: f.a_verifier.trim() || null,
    };
    const supabase = createClient();
    const { error } = await supabase.from("operations").update(champs).eq("id", ecriture.id);
    if (error) {
      setSaving(false);
      return setErreur("Enregistrement impossible : " + error.message);
    }
    await journaliser(supabase, nouveauLot(), `Modification de « ${ecriture.libelle} »`, [
      {
        operation_id: ecriture.id,
        action: "modification",
        avant: extraire(ecriture as unknown as Record<string, unknown>),
        apres: extraire({ ...ecriture, ...champs } as unknown as Record<string, unknown>),
      },
    ]);
    setSaving(false);
    setOk(true);
    onEnregistre();
  }

  return (
    <form onSubmit={enregistrer} className="space-y-3 rounded-lg border border-border bg-surface p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input type="date" value={f.date_operation} onChange={(e) => set("date_operation", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Montant">
          <input type="number" step="0.01" min="0" value={f.montant} onChange={(e) => set("montant", e.target.value)} className={inputCls} />
        </Field>
      </div>
      <Field label="Libellé">
        <input
          type="text"
          value={estDon ? LIBELLE_DON : f.libelle}
          disabled={estDon}
          onChange={(e) => set("libelle", e.target.value)}
          className={`${inputCls} disabled:opacity-60`}
          title={ecriture.libelle_origine ? `Libellé bancaire d'origine : ${ecriture.libelle_origine}` : undefined}
        />
      </Field>
      {estDon && (
        <p className="-mt-2 text-xs text-muted">
          Libellé neutre des écritures « Don » : le nom du tireur est conservé chiffré{coffreOuvert ? "" : " (coffre verrouillé)"}.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Catégorie">
          <select value={f.categorie_id} onChange={(e) => set("categorie_id", e.target.value)} className={inputCls}>
            <option value="">— à classer —</option>
            {categories.filter((c) => c.type === ecriture.type).map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        </Field>
        <Field label="Exercice d'affectation">
          <select value={f.exercice_id} onChange={(e) => set("exercice_id", e.target.value)} className={inputCls}>
            <option value="">— aucun —</option>
            {exercices.map((x) => (
              <option key={x.id} value={x.id}>{x.libelle}</option>
            ))}
          </select>
        </Field>
        <Field label="Compte">
          <select value={f.compte_id} onChange={(e) => set("compte_id", e.target.value)} className={inputCls}>
            <option value="">—</option>
            {comptes.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        </Field>
        <Field label="Mode de paiement">
          <select value={f.mode_paiement} onChange={(e) => set("mode_paiement", e.target.value)} className={inputCls}>
            <option value="">—</option>
            {MODES.map((m) => (
              <option key={m.v} value={m.v}>{m.l}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="À vérifier (question ouverte — vider pour lever l'alerte)">
        <input type="text" value={f.a_verifier} onChange={(e) => set("a_verifier", e.target.value)} className={inputCls} />
      </Field>
      {complement}
      {ecriture.libelle_origine && ecriture.libelle_origine !== ecriture.libelle && (
        <p className="text-xs text-muted">Banque : {ecriture.libelle_origine}</p>
      )}
      <div className="flex items-center justify-end gap-3">
        {erreur && <span className="mr-auto text-xs text-negative">{erreur}</span>}
        {ok && !modifie && <span className="mr-auto text-xs text-positive">✓ Enregistré</span>}
        <button
          type="submit"
          disabled={saving || !modifie}
          className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-40"
        >
          {saving ? "Enregistrement…" : "Enregistrer l'écriture"}
        </button>
      </div>
    </form>
  );
}
