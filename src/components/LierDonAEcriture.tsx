"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Don } from "@/components/GestionDons";
import type { DonCompta } from "@/components/PastilleDon";
import { useCoffre } from "@/components/CoffreProvider";
import { createClient } from "@/lib/supabase/client";
import { dechiffrerLibellesDon, texteDonateur } from "@/lib/libelleDon";
import { formatDate, formatEuros } from "@/lib/format";
import { JOURS_LIEN_FORT, construireIdentites, ecrituresPour, type EcritureCandidate, type EcritureDon } from "@/lib/liaisonDons";

type OperationBrute = {
  id: string;
  parent_id: string | null;
  date_operation: string;
  montant: number | string;
  libelle: string;
  libelle_origine: string | null;
  libelle_origine_chiffre: string | null;
  est_ventilee: boolean;
  exercice_id: string | null;
};

const COLONNES = "id, parent_id, date_operation, montant, libelle, libelle_origine, libelle_origine_chiffre, est_ventilee, exercice_id";

const pastille = (ton: "vert" | "ambre" | "rouge", texte: string) => (
  <span
    className={`inline-block whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
      ton === "vert" ? "bg-positive/15 text-positive" : ton === "ambre" ? "bg-gold-soft text-gold" : "bg-negative/10 text-negative"
    }`}
  >
    {texte}
  </span>
);

/**
 * Lien d'un don avec son écriture comptable, depuis la fiche du don : affiche l'écriture reliée (avec « Délier »),
 * ou propose les écritures « Don » sans don proches de ce don (±35 jours, ou ±1 an sur demande), classées par nom
 * (lu dans l'intitulé bancaire), montant et date. Rien n'est relié sans clic.
 */
export default function LierDonAEcriture({ don, operationsLiees, dons }: { don: Don; operationsLiees: Set<string>; /** Tous les dons (déchiffrés) : donateurs connus. */ dons: Don[] }) {
  const router = useRouter();
  const coffre = useCoffre();
  const [ouvert, setOuvert] = useState(false);
  const [large, setLarge] = useState(false);
  const [ecritures, setEcritures] = useState<EcritureDon[] | null>(null);
  const [lieeInfo, setLieeInfo] = useState<{ id: string; date: string; montant: number } | null>(null);
  const liee = lieeInfo && lieeInfo.id === don.operation_id ? lieeInfo : null;
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Écriture déjà reliée : sa date et son montant.
  useEffect(() => {
    if (!don.operation_id) return;
    let annule = false;
    createClient()
      .from("operations")
      .select("date_operation, montant")
      .eq("id", don.operation_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!annule && data) setLieeInfo({ id: don.operation_id as string, date: data.date_operation as string, montant: Number(data.montant) });
      });
    return () => {
      annule = true;
    };
  }, [don.operation_id]);

  // Écritures « Don » sans don, à ±1 an du don (le tri fin se fait ensuite).
  useEffect(() => {
    if (!ouvert || don.operation_id) return;
    let annule = false;
    (async () => {
      const supabase = createClient();
      const { data: cats } = await supabase.from("categories").select("id").eq("nom", "Don");
      const ids = (cats ?? []).map((c) => c.id as string);
      const d = new Date(`${don.date_don}T12:00:00`);
      const borne = (jours: number) => new Date(d.getTime() + jours * 86400000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("operations")
        .select(COLONNES)
        .eq("type", "recette")
        .in("categorie_id", ids)
        .gte("date_operation", borne(-366))
        .lte("date_operation", borne(366));
      if (error || annule) return setErreur(error ? "Lecture des écritures impossible : " + error.message : null);
      const ops = ((data ?? []) as unknown as OperationBrute[]).filter((o) => !o.est_ventilee && !operationsLiees.has(o.id));
      const parents = [...new Set(ops.map((o) => o.parent_id).filter((x): x is string => !!x))];
      const meres = new Map<string, OperationBrute>();
      if (parents.length > 0) {
        const { data: m } = await supabase.from("operations").select(COLONNES).in("id", parents);
        for (const o of (m ?? []) as unknown as OperationBrute[]) meres.set(o.id, o);
      }
      const clair = async (o: OperationBrute) =>
        [texteDonateur(await dechiffrerLibellesDon(coffre.dechiffrer, o.libelle_origine_chiffre)), o.libelle_origine].filter(Boolean).join(" ");
      const res: EcritureDon[] = [];
      for (const o of ops) {
        const mere = o.parent_id ? meres.get(o.parent_id) : undefined;
        const texte = [await clair(o), mere ? await clair(mere) : ""].filter(Boolean).join(" ") || null;
        res.push({ id: o.id, date: o.date_operation, montant: Number(o.montant), texte, exerciceId: o.exercice_id });
      }
      if (!annule) setEcritures(res);
    })();
    return () => {
      annule = true;
    };
  }, [ouvert, don.operation_id, don.date_don, operationsLiees, coffre.dechiffrer]);

  const candidats: EcritureCandidate[] = ecritures ? ecrituresPour(don as unknown as DonCompta, ecritures, large ? 366 : 35, 10, construireIdentites(dons as unknown as DonCompta[])) : [];

  async function lier(c: EcritureCandidate) {
    if (
      Math.abs(c.ecart) >= 0.005 &&
      !window.confirm(`Le don est de ${formatEuros(Number(don.montant))}, l'écriture de ${formatEuros(c.ecriture.montant)}. Les relier quand même ?`)
    ) {
      return;
    }
    setBusy(true);
    setErreur(null);
    const maj: { operation_id: string; exercice_id?: string } = { operation_id: c.ecriture.id };
    if (!don.exercice_id && c.ecriture.exerciceId) maj.exercice_id = c.ecriture.exerciceId;
    const { error } = await createClient().from("dons").update(maj).eq("id", don.id).is("operation_id", null);
    setBusy(false);
    if (error) return setErreur("Liaison impossible : " + error.message);
    setOuvert(false);
    router.refresh();
  }

  async function delier() {
    if (!window.confirm("Délier ce don de son écriture comptable ? Le don reste dans l'onglet Dons.")) return;
    setBusy(true);
    setErreur(null);
    const { error } = await createClient().from("dons").update({ operation_id: null }).eq("id", don.id);
    setBusy(false);
    if (error) return setErreur("Opération impossible : " + error.message);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Écriture comptable</span>
        {don.operation_id ? (
          <>
            <span className="text-positive">✓ reliée{liee ? ` : ${formatDate(liee.date)} · ${formatEuros(liee.montant)}` : ""}</span>
            <button type="button" onClick={delier} disabled={busy} className="text-xs text-muted hover:text-negative hover:underline disabled:opacity-50">
              Délier
            </button>
          </>
        ) : (
          <>
            <span className="text-muted">hors compta</span>
            <button
              type="button"
              onClick={() => setOuvert((v) => !v)}
              className="rounded-full border border-dashed border-accent px-2 py-0.5 text-xs font-medium text-accent hover:bg-accent-soft"
            >
              {ouvert ? "Fermer" : "🔗 Lier à une écriture comptable…"}
            </button>
          </>
        )}
        {erreur && <span className="text-xs text-negative">{erreur}</span>}
      </div>
      {ouvert && !don.operation_id && (
        <div className="mt-2 rounded-lg border border-border bg-surface p-2 text-xs">
          {!coffre.estOuvert && <p className="mb-1 text-muted">🔒 Coffre verrouillé : les intitulés ne sont pas lisibles, le classement se fait sur le montant et la date.</p>}
          {ecritures === null ? (
            <p className="text-muted">Recherche des écritures…</p>
          ) : candidats.length === 0 ? (
            <p className="text-muted">Aucune écriture « Don » sans don ne correspond à ±{large ? "1 an" : "35 jours"} (montant exact ou nom reconnu).</p>
          ) : (
            candidats.map((c) => (
              <div key={c.ecriture.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-1.5 last:border-0">
                <span className="min-w-0">
                  <span className="tabular-nums">
                    {formatDate(c.ecriture.date)} · <strong>{formatEuros(c.ecriture.montant)}</strong>
                  </span>
                  {c.ecriture.texte && <span className="ml-2 inline-block max-w-[18rem] truncate align-bottom text-muted" title={c.ecriture.texte}>{c.ecriture.texte}</span>}
                  <span className="ml-2 inline-flex flex-wrap gap-1">
                    {c.nom >= 0.999 ? pastille("vert", "✓ nom") : c.nom > 0 ? pastille("ambre", "≈ nom partiel") : pastille("rouge", "✗ nom")}
                    {pastille(c.jours <= JOURS_LIEN_FORT ? "vert" : c.jours <= 35 ? "vert" : "ambre", `${c.jours <= JOURS_LIEN_FORT ? "✓ ±3 j" : c.jours <= 35 ? "✓ ±30 j" : "date éloignée"} (${c.jours} j)`)}
                    {Math.abs(c.ecart) < 0.005 ? pastille("vert", "✓ montant") : pastille("rouge", `✗ ${c.ecart > 0 ? "+" : "−"}${formatEuros(Math.abs(c.ecart))}`)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => lier(c)}
                  disabled={busy}
                  className="rounded bg-accent px-2 py-0.5 font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
                >
                  Lier
                </button>
              </div>
            ))
          )}
          {ecritures !== null && (
            <button type="button" onClick={() => setLarge((v) => !v)} className="mt-1 text-accent hover:underline">
              {large ? "Revenir à ±35 jours" : "Chercher plus largement (±1 an)"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
