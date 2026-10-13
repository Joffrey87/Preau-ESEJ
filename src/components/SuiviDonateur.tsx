"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Field, inputCls } from "./GestionComptes";
import { createClient } from "@/lib/supabase/client";
import { ETATS_SUIVI, TYPES_ACTION, formatDateHeure, type SuiviAction } from "@/lib/suiviDonateurs";

/** Ajout d'une entrée de suivi : une ou plusieurs actions, un nouvel état facultatif, une note. */
export function AjoutSuivi({
  cle,
  nom,
  auteur,
  onClose,
}: {
  cle: string;
  nom: string;
  auteur: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [actions, setActions] = useState<string[]>([]);
  const [etat, setEtat] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const basculer = (a: string) => setActions((l) => (l.includes(a) ? l.filter((x) => x !== a) : [...l, a]));

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (actions.length === 0) return setErreur("Choisissez au moins une action.");
    setBusy(true);
    setErreur(null);
    const { error } = await createClient().rpc("ajouter_suivi_action", {
      p_cible_type: "donateur",
      p_cible_cle: cle,
      p_actions: TYPES_ACTION.filter((t) => actions.includes(t)),
      p_etat: etat,
      p_note: note,
      p_auteur: auteur ?? "",
    });
    setBusy(false);
    if (error) return setErreur("Enregistrement impossible : " + error.message);
    onClose();
    router.refresh();
  }

  return (
    <Modal title={`Ajouter une action — ${nom}`} onClose={onClose}>
      <form onSubmit={enregistrer} className="space-y-3">
        <Field label="Action(s)">
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {TYPES_ACTION.map((a) => (
              <label key={a} className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2 py-1 text-sm">
                <input type="checkbox" checked={actions.includes(a)} onChange={() => basculer(a)} className="h-4 w-4" />
                {a}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Nouvel état (facultatif)">
          <select value={etat} onChange={(e) => setEtat(e.target.value)} className={inputCls}>
            <option value="">Inchangé</option>
            {ETATS_SUIVI.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note (facultative)">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={inputCls} />
        </Field>
        <p className="text-xs text-muted">Signée : {auteur || "votre profil"}</p>
        {erreur && <p className="text-sm text-negative">{erreur}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-sm">
            Annuler
          </button>
          <button type="submit" disabled={busy} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Historique complet, du plus récent au plus ancien. */
export function HistoriqueSuivi({ historique }: { historique: SuiviAction[] }) {
  return (
    <div>
      <div className="mb-1 text-sm font-medium">Suivi des actions</div>
      {historique.length === 0 ? (
        <p className="text-sm text-muted">Aucune action enregistrée.</p>
      ) : (
        <ol className="space-y-2">
          {historique.map((h) => (
            <li key={h.id} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-1">
                {h.actions.map((a) => (
                  <span key={a} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium">
                    {a}
                  </span>
                ))}
                {h.etat && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium">→ {h.etat}</span>}
              </div>
              {h.note && <p className="mt-1 whitespace-pre-wrap">{h.note}</p>}
              <div className="mt-1 text-xs text-muted">
                {formatDateHeure(h.cree_le)} · {h.auteur}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
