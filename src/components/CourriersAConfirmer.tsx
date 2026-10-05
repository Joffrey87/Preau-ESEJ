"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Don } from "@/components/GestionDons";
import { donPourRecu } from "@/components/ListeRecus";
import DeverrouillerCoffre from "@/components/DeverrouillerCoffre";
import { useCoffre } from "@/components/CoffreProvider";
import { useDonsDechiffres } from "@/lib/donsChiffre";
import { createClient } from "@/lib/supabase/client";
import { genererRecuPdf } from "@/lib/recu";
import { estCouple, nomComplet } from "@/lib/couple";
import { formatDate, formatEuros, todayISO } from "@/lib/format";

type Courrier = { numero: string; annee: number; dons: Don[]; representant: Don; total: number };

/** Adresse telle qu'elle se recopie sur l'enveloppe. */
function adresseDe(d: Don): string[] {
  const t = (v: string | null | undefined) => (v ?? "").trim();
  const lignes: string[] = [];
  if (d.est_personne_morale) {
    lignes.push(t(d.raison_sociale) || t(d.donateur_nom));
    const contact = [t(d.donateur_prenom), t(d.donateur_nom)].filter(Boolean).join(" ");
    if (contact && contact !== t(d.raison_sociale)) lignes.push(`À l'attention de ${[t(d.donateur_titre), contact].filter(Boolean).join(" ")}`);
  } else {
    lignes.push(estCouple(d.donateur_titre) ? nomComplet(d) : [t(d.donateur_prenom), t(d.donateur_nom)].filter(Boolean).join(" "));
  }
  if (t(d.adresse)) lignes.push(t(d.adresse));
  if (t(d.cp_ville)) lignes.push(t(d.cp_ville));
  return lignes.filter(Boolean);
}

/**
 * Courriers à confirmer : reçus fiscaux à poster, remis au secrétaire. Pour chacun, l'adresse du donateur, le PDF à
 * imprimer (lettre de remerciement + reçu) et la confirmation « Posté » ; seul l'état d'envoi est modifié.
 */
export default function CourriersAConfirmer({ donsInit }: { donsInit: Don[] }) {
  const router = useRouter();
  const coffre = useCoffre();
  const { dons, verrou } = useDonsDechiffres(donsInit);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; t: string } | null>(null);

  const courriers = useMemo<Courrier[]>(() => {
    const par = new Map<string, Don[]>();
    for (const d of dons) if (d.recu_numero) (par.get(d.recu_numero) ?? par.set(d.recu_numero, []).get(d.recu_numero)!).push(d);
    return [...par]
      .map(([numero, liste]) => {
        const tri = [...liste].sort((a, b) => a.date_don.localeCompare(b.date_don));
        return {
          numero,
          annee: Number(tri[tri.length - 1].date_don.slice(0, 4)),
          dons: tri,
          representant: tri[tri.length - 1],
          total: tri.reduce((s, d) => s + Number(d.montant), 0),
        };
      })
      .sort((a, b) => a.numero.localeCompare(b.numero));
  }, [dons]);

  async function pdf(c: Courrier) {
    setMessage(null);
    setBusy(c.numero);
    try {
      const dateEdition = c.dons.find((d) => d.recu_emis_le)?.recu_emis_le ?? todayISO();
      await genererRecuPdf(donPourRecu(c.representant, c.dons, c.numero, dateEdition), { ouvrir: true });
    } catch (e) {
      setMessage({ ok: false, t: e instanceof Error ? e.message : "Génération du PDF impossible." });
    } finally {
      setBusy(null);
    }
  }

  async function poste(liste: Courrier[]) {
    if (liste.length === 0) return;
    if (!window.confirm(liste.length === 1 ? `Confirmer que le courrier du reçu ${liste[0].numero} est posté ?` : `Confirmer que ces ${liste.length} courriers sont postés ?`)) return;
    setMessage(null);
    const supabase = createClient();
    let faits = 0;
    for (const c of liste) {
      setBusy(c.numero);
      const { error } = await supabase.rpc("confirmer_courrier_poste", { p_numero: c.numero });
      if (error) {
        setBusy(null);
        setMessage({ ok: false, t: `Reçu ${c.numero} : ${error.message}` });
        router.refresh();
        return;
      }
      faits += 1;
    }
    setBusy(null);
    setMessage({ ok: true, t: `${faits} courrier${faits > 1 ? "s" : ""} marqué${faits > 1 ? "s" : ""} posté${faits > 1 ? "s" : ""} le ${formatDate(todayISO())}.` });
    router.refresh();
  }

  if (coffre.charge && !coffre.estConfigure) {
    return <p className="rounded-xl border border-border bg-surface px-4 py-6 text-sm text-muted">L&apos;accès aux données des donateurs n&apos;est pas encore ouvert pour ce profil : demandez au Trésorier de générer votre code.</p>;
  }
  if (verrou) {
    return (
      <div className="rounded-xl border border-gold/40 bg-gold-soft/40 px-4 py-6 text-sm">
        <p className="text-gold">🔒 Saisissez votre code pour afficher les noms et les adresses des donateurs.</p>
        <div className="mt-3">
          <DeverrouillerCoffre label="🔓 Saisir mon code" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {message && (
        <p className={`rounded-lg px-3 py-2 text-sm ${message.ok ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"}`}>{message.t}</p>
      )}
      {courriers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface-2 px-4 py-10 text-center text-sm text-muted">Aucun courrier à confirmer.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted">
              {courriers.length} courrier{courriers.length > 1 ? "s" : ""} à poster
            </span>
            {courriers.length > 1 && (
              <button
                type="button"
                onClick={() => void poste(courriers)}
                disabled={busy !== null}
                className="rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-surface-2 disabled:opacity-50"
              >
                Tout marquer posté
              </button>
            )}
          </div>
          {courriers.map((c) => (
            <article key={c.numero} className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-surface p-4">
              <div className="min-w-0 text-sm">
                <div className="mb-1 text-xs text-muted">
                  Reçu {c.numero.replace(/^RE_/, "N°")} · {c.annee} · {c.dons.length} don{c.dons.length > 1 ? "s" : ""} · <strong className="text-foreground">{formatEuros(c.total)}</strong>
                </div>
                {adresseDe(c.representant).map((l, i) => (
                  <div key={i} className={i === 0 ? "font-medium" : ""}>
                    {l}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void pdf(c)}
                  disabled={busy !== null}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
                  title="Ouvre le PDF : lettre de remerciement (page 1) et reçu fiscal (page 2)"
                >
                  {busy === c.numero ? "…" : "📄 PDF (lettre + reçu)"}
                </button>
                <button
                  type="button"
                  onClick={() => void poste([c])}
                  disabled={busy !== null}
                  className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
                >
                  ✓ Posté
                </button>
              </div>
            </article>
          ))}
        </>
      )}
    </div>
  );
}
