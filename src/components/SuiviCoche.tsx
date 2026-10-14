"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TYPES_ACTION_PROSPECT, formatDateHeure, type SuiviAction } from "@/lib/suiviDonateurs";
import { todayISO } from "@/lib/format";

const H24 = 24 * 3600 * 1000;
/** Date affichée d'une ligne du Suivi : date choisie, sinon date d'enregistrement. */
export const dateSuivi = (l: SuiviAction) =>
  l.date_action ? new Date(l.date_action + "T12:00:00").toLocaleDateString("fr-FR") : new Date(l.cree_le).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });

/**
 * Cellule Suivi : « dernière action — date » ; un clic ouvre la liste à cocher des actions principales avec une date
 * (aujourd'hui par défaut). Cocher enregistre l'action ; sa dernière ligne reste modifiable par son auteur pendant 24 h.
 * « Plus d'options… » ouvre la fenêtre complète (+ Autre, commentaire…).
 */
export default function SuiviCoche({
  der, auteur, peutSuivre, cibleType, cle, donsIds, nom, onPlus,
}: {
  der: SuiviAction | undefined;
  auteur: string | null;
  peutSuivre: boolean;
  cibleType: "donateur" | "prospect";
  cle: string;
  donsIds?: string[];
  nom: string;
  onPlus: (existante: SuiviAction | null) => void;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [maintenant, setMaintenant] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const modifiable = !!der && der.actions.length > 0 && der.auteur === auteur && maintenant - new Date(der.cree_le).getTime() < H24 ? der : null;
  const coches = new Set(modifiable?.actions ?? []);

  async function cocher(a: string, oui: boolean) {
    setBusy(true); setErreur(null);
    const sb = createClient();
    const jour = date || todayISO();
    let id = modifiable?.id ?? null;
    let err: string | null = null;
    if (modifiable) {
      const actions = oui ? [...modifiable.actions, a] : modifiable.actions.filter((x) => x !== a);
      const { error } = await sb.rpc("modifier_suivi_action", { p_id: modifiable.id, p_actions: actions, p_note: modifiable.note ?? "", p_auteur: auteur ?? "" });
      err = error?.message ?? null;
    } else if (oui) {
      const { data, error } = await sb.rpc("ajouter_suivi_action", {
        p_cible_type: cibleType, p_cible_cle: cle, p_dons_ids: donsIds ?? [], p_actions: [a], p_etat: "", p_note: "", p_auteur: auteur ?? "",
      });
      err = error?.message ?? null; id = (data as string | null) ?? null;
    }
    if (!err && id) {
      const { error } = await sb.rpc("dater_suivi_action", { p_id: id, p_date: jour, p_auteur: auteur ?? "" });
      err = error?.message ?? null;
    }
    setBusy(false);
    if (err) return setErreur(err);
    router.refresh();
  }

  const resume = der && der.actions.length ? `${der.actions.join(", ")} — ${dateSuivi(der)}` : null;
  return (
    <span className="relative inline-block">
      <button type="button" disabled={!peutSuivre} onClick={() => { setMaintenant(Date.now()); setOuvert(true); }}
        title={der ? `Dernière action le ${formatDateHeure(der.cree_le)} par ${der.auteur}` : peutSuivre ? "Cocher une action" : undefined}
        className="rounded px-1 text-xs enabled:hover:bg-surface-2">
        {resume ?? <span className="text-muted">{peutSuivre ? "+ action" : "—"}</span>}
      </button>
      {ouvert && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOuvert(false)} />
          <div className="absolute left-1/2 top-full z-20 mt-1 w-60 -translate-x-1/2 space-y-1.5 rounded-lg border border-border bg-surface p-2.5 text-left text-sm shadow-lg">
            <div className="text-xs font-medium text-muted">Suivi : {nom}</div>
            <label className="flex items-center gap-2 text-xs text-muted">Date
              <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} disabled={busy}
                className="rounded border border-border bg-background px-1 py-0.5 text-xs text-foreground" />
            </label>
            {modifiable && <p className="text-[11px] text-muted">Votre action du {dateSuivi(modifiable)} (modifiable 24 h)</p>}
            <ul className="space-y-0.5">
              {TYPES_ACTION_PROSPECT.map((a) => (
                <li key={a}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-surface-2">
                    <input type="checkbox" checked={coches.has(a)} disabled={busy} onChange={(e) => void cocher(a, e.target.checked)} className="h-3.5 w-3.5" />
                    {a}
                  </label>
                </li>
              ))}
            </ul>
            {erreur && <p className="text-xs text-negative">{erreur}</p>}
            <button type="button" onClick={() => { setOuvert(false); onPlus(modifiable); }}
              className="w-full rounded border border-border px-2 py-1 text-xs hover:bg-surface-2">
              Plus d&apos;options… (Autre, commentaire)
            </button>
          </div>
        </>
      )}
    </span>
  );
}
