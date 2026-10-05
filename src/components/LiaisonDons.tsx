"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatEuros } from "@/lib/format";
import { candidatsPour, libelleDonLie, type Candidat, type IdentiteConnue, type Proposition } from "@/lib/liaisonDons";
import type { DonCompta } from "@/components/PastilleDon";

/** Pastilles qui expliquent pourquoi un don est proposé. */
function Indices({ c }: { c: Candidat }) {
  const exact = Math.abs(c.ecart) < 0.005;
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-[11px]">
      <span className={`rounded-full px-1.5 py-0.5 ${exact ? "bg-positive/15 text-positive" : "bg-gold-soft text-gold"}`}>
        {exact ? "montant exact" : `${c.ecart > 0 ? "+" : "−"}${formatEuros(Math.abs(c.ecart))}`}
      </span>
      <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-muted">{c.jours === 0 ? "même jour" : `±${c.jours} j`}</span>
      {c.nom > 0 && <span className="rounded-full bg-positive/15 px-1.5 py-0.5 text-positive">nom reconnu</span>}
    </span>
  );
}

/**
 * Lien d'une sous-écriture « Don » avec un don de l'onglet Dons : affiche le don
 * relié (avec « Délier »), ou propose les dons « hors compta » à ±1 mois,
 * classés par nom, date et montant. Rien n'est relié sans clic.
 */
export function LienDonFille({
  filleId,
  exerciceId,
  date,
  montant,
  texte,
  lieId,
  donParId,
  libres,
  verrou,
  onFiche,
  onModifierCandidat,
  identites,
}: {
  filleId: string;
  exerciceId: string | null;
  date: string;
  montant: number;
  /** Libellés (bancaire, saisi) où chercher le nom du donateur. */
  texte: string | null;
  /** Don déjà relié à cette sous-écriture (lien explicite). */
  lieId: string | null;
  donParId: Map<string, DonCompta>;
  libres: DonCompta[];
  verrou: boolean;
  /** Ouvre la fiche d'un don (fenêtre « fiche donateur »). */
  onFiche?: (donId: string, signaler: boolean) => void;
  /** Ouvre la fiche d'un don proposé, pour la modifier ou la compléter avant de le lier. */
  onModifierCandidat?: (donId: string, signaler: boolean) => void;
  /** Donateurs connus : un nom de donateur dans l'intitulé interdit de proposer un autre donateur. */
  identites?: IdentiteConnue[];
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const lie = lieId ? donParId.get(lieId) : undefined;
  const candidats = useMemo(
    () => (ouvert ? candidatsPour({ date, montant, texte }, libres, 8, identites) : []),
    [ouvert, date, montant, texte, libres, identites],
  );

  async function lier(c: Candidat) {
    if (
      Math.abs(c.ecart) >= 0.005 &&
      !window.confirm(
        `Le don est de ${formatEuros(Number(c.don.montant))}, la sous-écriture de ${formatEuros(montant)}. Les relier quand même ?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setErreur(null);
    const maj: { operation_id: string; exercice_id?: string } = { operation_id: filleId };
    if (!c.don.exercice_id && exerciceId) maj.exercice_id = exerciceId;
    const { error } = await createClient().from("dons").update(maj).eq("id", c.don.id);
    setBusy(false);
    if (error) return setErreur("Liaison impossible : " + error.message);
    setOuvert(false);
    router.refresh();
  }

  async function delier() {
    if (!lie) return;
    if (!window.confirm("Délier ce don de la sous-écriture ? Le don reste dans l'onglet Dons (« hors compta »).")) return;
    setBusy(true);
    setErreur(null);
    const { error } = await createClient().from("dons").update({ operation_id: null }).eq("id", lie.id);
    setBusy(false);
    if (error) return setErreur("Opération impossible : " + error.message);
    router.refresh();
  }

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="mt-1 text-xs" onClick={stop}>
      {lie ? (
        <span className="inline-flex flex-wrap items-center gap-2 text-muted">
          <span>
            Relié à <strong className="text-foreground">{verrou && lie.pii_chiffre ? "🔒" : libelleDonLie(lie)}</strong> — don du{" "}
            {formatDate(lie.date_don)} · {formatEuros(Number(lie.montant))}
          </span>
          {onFiche && (
            <button type="button" onClick={() => onFiche(lie.id, false)} className="text-accent hover:underline">
              Fiche
            </button>
          )}
          <button type="button" onClick={delier} disabled={busy} className="text-muted hover:text-negative hover:underline disabled:opacity-50">
            Délier
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setOuvert((v) => !v)}
          className="rounded-full border border-dashed border-accent px-2 py-0.5 font-medium text-accent hover:bg-accent-soft"
          title="Relier cette sous-écriture à un don « hors compta » de l'onglet Dons"
        >
          {ouvert ? "Fermer" : "🔗 Lier à un don…"}
        </button>
      )}
      {erreur && <span className="ml-2 text-negative">{erreur}</span>}
      {ouvert && !lie && (
        <div className="mt-1.5 max-w-xl rounded-lg border border-border bg-surface p-1.5">
          {verrou && <p className="px-2 pb-1 text-muted">🔒 Coffre verrouillé : les noms ne sont pas lisibles, le classement se fait sur le montant et la date.</p>}
          {candidats.length === 0 ? (
            <p className="px-2 py-2 text-muted">Aucun don « hors compta » ne correspond à ±1 mois (montant exact ou nom reconnu).</p>
          ) : (
            candidats.map((c) => (
              <div key={c.don.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-2 py-1.5 last:border-0">
                <span
                  className={`min-w-0 ${onModifierCandidat ? "cursor-pointer rounded hover:bg-surface-2" : ""}`}
                  onClick={onModifierCandidat ? () => onModifierCandidat(c.don.id, false) : undefined}
                  title={onModifierCandidat ? "Cliquer pour modifier ou compléter les informations de ce don avant de le lier" : undefined}
                >
                  <span className="font-medium">{verrou && c.don.pii_chiffre ? "🔒" : libelleDonLie(c.don)}</span>
                  <span className="ml-2 tabular-nums text-muted">
                    {formatDate(c.don.date_don)} · {formatEuros(Number(c.don.montant))}
                  </span>
                  <span className="ml-2">
                    <Indices c={c} />
                  </span>
                </span>
                {onModifierCandidat && (
                  <button type="button" onClick={() => onModifierCandidat(c.don.id, false)} className="ml-auto text-accent hover:underline">
                    Modifier
                  </button>
                )}
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
        </div>
      )}
    </div>
  );
}

/**
 * Propositions à la ventilation : lots de dons « hors compta » dont la somme
 * égale ou approche le montant restant à ventiler. Un clic crée les
 * sous-écritures « Don » et les relie ; rien n'est fait sans clic.
 */
export function SuggestionsVentilation({
  propositions,
  verrou,
  busy,
  onCreer,
}: {
  propositions: Proposition[];
  verrou: boolean;
  busy: boolean;
  onCreer: (p: Proposition) => void;
}) {
  if (propositions.length === 0) return null;
  return (
    <div className="mb-2 rounded-lg border border-accent/40 bg-accent-soft/30 p-2 text-xs">
      <div className="mb-1 font-medium text-accent">Dons « hors compta » qui pourraient correspondre à cette ligne</div>
      {verrou && <p className="mb-1 text-muted">🔒 Coffre verrouillé : proposition sur la date et le montant seulement.</p>}
      {propositions.map((p, i) => (
        <div key={i} className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 py-1.5 first:border-0">
          <span className="min-w-0">
            {p.dons.map((c, j) => (
              <span key={c.don.id} className="mr-3 inline-block">
                {j > 0 && <span className="mr-2 text-muted">+</span>}
                <span className="font-medium">{verrou && c.don.pii_chiffre ? "🔒" : libelleDonLie(c.don)}</span>{" "}
                <span className="tabular-nums text-muted">
                  {formatEuros(Number(c.don.montant))} · {formatDate(c.don.date_don)}
                </span>
              </span>
            ))}
            <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[11px] ${p.exacte ? "bg-positive/15 text-positive" : "bg-gold-soft text-gold"}`}>
              {p.exacte ? `total ${formatEuros(p.somme)} : exact` : `total ${formatEuros(p.somme)} (${p.ecart > 0 ? "+" : "−"}${formatEuros(Math.abs(p.ecart))})`}
            </span>
          </span>
          <button
            type="button"
            onClick={() => onCreer(p)}
            disabled={busy}
            className="rounded bg-accent px-2 py-0.5 font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            Créer {p.dons.length} sous-écriture{p.dons.length > 1 ? "s" : ""} et relier
          </button>
        </div>
      ))}
    </div>
  );
}
