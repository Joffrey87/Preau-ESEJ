"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Field, inputCls } from "./GestionComptes";
import { createClient } from "@/lib/supabase/client";
import {
  ETATS_SUIVI,
  PROFILS_ADMIN_RESERVE,
  TYPES_ACTION,
  dernierCommentaire,
  etatCourant,
  formatDateHeure,
  type SuiviAction,
} from "@/lib/suiviDonateurs";
import { PROFILS_RECHERCHE_FONDS } from "@/lib/profilsContact";

/** Ajout d'une entrée de suivi : une ou plusieurs actions, un nouvel état facultatif, une note. */
export function AjoutSuivi({
  cibleType = "donateur",
  cle,
  donsIds = [],
  nom,
  auteur,
  onClose,
  existante = null,
  etats,
  noteSeule = false,
}: {
  /** Modification de sa dernière action (moins de 24 h) au lieu d'un ajout. */
  existante?: SuiviAction | null;
  /** États proposés (prospects : état unifié) ; défaut : états du Suivi. */
  etats?: readonly string[];
  /** Ajout d'un commentaire seul (aucune action exigée). */
  noteSeule?: boolean;
  cibleType?: "donateur" | "prospect";
  /** Donateur : clé (secours) ; prospect : id. */
  cle: string;
  /** Donateur : ses dons actuels (lien stable). */
  donsIds?: string[];
  nom: string;
  auteur: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const connus = (a: string) => (TYPES_ACTION as readonly string[]).includes(a);
  const [actions, setActions] = useState<string[]>(() => (existante?.actions ?? []).filter(connus));
  const [autre, setAutre] = useState<string | null>(() => (existante?.actions ?? []).filter((a) => !connus(a)).join(", ") || null);
  const [etat, setEtat] = useState("");
  const [note, setNote] = useState(existante?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const basculer = (a: string) => setActions((l) => (l.includes(a) ? l.filter((x) => x !== a) : [...l, a]));

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    const libre = (autre ?? "").trim();
    const liste = [...TYPES_ACTION.filter((t) => actions.includes(t)), ...(libre ? [libre.slice(0, 200)] : [])];
    if (liste.length === 0 && !(noteSeule && note.trim())) return setErreur(noteSeule ? "Écrivez un commentaire." : "Choisissez au moins une action.");
    setBusy(true);
    setErreur(null);
    const sb = createClient();
    const { error } = existante
      ? await sb.rpc("modifier_suivi_action", { p_id: existante.id, p_actions: liste, p_note: note, p_auteur: auteur ?? "" })
      : await sb.rpc("ajouter_suivi_action", {
          p_cible_type: cibleType,
          p_cible_cle: cle,
          p_dons_ids: cibleType === "donateur" ? donsIds : [],
          p_actions: liste,
          p_etat: etat,
          p_note: note,
          p_auteur: auteur ?? "",
        });
    // Prospect : le nouvel état choisi devient aussi son état unifié.
    if (!error && !existante && etat && cibleType === "prospect" && etats) {
      await sb.from("prospects").update({ etat_unifie: etat, etat_unifie_le: new Date().toISOString(), etat_unifie_par: auteur ?? null }).eq("id", cle);
    }
    setBusy(false);
    if (error) return setErreur("Enregistrement impossible : " + error.message);
    onClose();
    router.refresh();
  }

  return (
    <Modal title={`${existante ? "Modifier l'action" : noteSeule ? "Commentaire" : "Ajouter une action"} — ${nom}`} onClose={onClose}>
      <form onSubmit={enregistrer} className="space-y-3">
        {!noteSeule && <Field label="Action(s)">
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {TYPES_ACTION.map((a) => (
              <label key={a} className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2 py-1 text-sm">
                <input type="checkbox" checked={actions.includes(a)} onChange={() => basculer(a)} className="h-4 w-4" />
                {a}
              </label>
            ))}
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-2 py-1 text-sm">
              <input type="checkbox" checked={autre !== null} onChange={() => setAutre((v) => (v === null ? "" : null))} className="h-4 w-4" />
              + Autre (texte libre)
            </label>
          </div>
          {autre !== null && (
            <input autoFocus type="text" maxLength={200} value={autre} onChange={(e) => setAutre(e.target.value)}
              placeholder="Écrivez l'action… (ex. Déposé une plaquette)" className={`${inputCls} mt-2`} />
          )}
        </Field>}
        {!existante && !noteSeule && <Field label="Nouvel état (facultatif)">
          <select value={etat} onChange={(e) => setEtat(e.target.value)} className={inputCls}>
            <option value="">Inchangé</option>
            {(etats ?? ETATS_SUIVI).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>}
        <Field label={noteSeule ? "Commentaire" : "Note (facultative)"}>
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

/** Historique succinct, une ligne par action : « date — action(s) », du plus récent au plus ancien. */
export function HistoriqueSuivi({ historique }: { historique: SuiviAction[] }) {
  return (
    <div>
      <div className="mb-1 text-sm font-medium">Suivi des actions</div>
      {historique.length === 0 ? (
        <p className="text-sm text-muted">Aucune action enregistrée.</p>
      ) : (
        <ol className="divide-y divide-border rounded-lg border border-border bg-surface text-sm">
          {historique.map((h) => (
            <li key={h.id} className="px-3 py-1.5" title={`${formatDateHeure(h.cree_le)} · ${h.auteur}`}>
              <span className="tabular-nums text-muted">{new Date(h.cree_le).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</span>
              {" — "}
              <span className="font-medium">{h.actions.length ? h.actions.join(", ") : "Commentaire"}</span>
              {h.etat && <span className="text-accent"> → {h.etat}</span>}
              {h.note && <span className="text-muted"> · {h.note}</span>}
              <span className="text-xs text-muted"> ({h.auteur})</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** « Réservé à » : prénom Recherche de fonds, profil d'Administration ou nom libre (« Autre… »). */
export function ChoixReserve({
  value,
  disabled,
  onChange,
  compact = false,
  label,
}: {
  value: string | null;
  disabled?: boolean;
  onChange: (v: string) => void;
  compact?: boolean;
  label?: string;
}) {
  const connu = !value || PROFILS_RECHERCHE_FONDS.includes(value) || PROFILS_ADMIN_RESERVE.includes(value);
  const [autre, setAutre] = useState<string | null>(null);
  const cls = compact
    ? "rounded-md border border-border bg-background px-1 py-0.5 text-sm"
    : "rounded-md border border-border bg-background px-2 py-1 text-sm";
  if (autre !== null) {
    const valider = () => {
      const v = autre.trim();
      setAutre(null);
      if (v && v !== value) onChange(v);
    };
    return (
      <input
        autoFocus
        type="text"
        maxLength={80}
        value={autre}
        placeholder="Nom…"
        aria-label={label ?? "Réservé à (autre)"}
        onChange={(e) => setAutre(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            valider();
          }
          if (e.key === "Escape") setAutre(null);
        }}
        onBlur={valider}
        className={`${cls} w-32`}
      />
    );
  }
  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      aria-label={label ?? "Réservé à"}
      onChange={(e) => (e.target.value === "__autre" ? setAutre(connu ? "" : value ?? "") : onChange(e.target.value))}
      className={cls}
    >
      <option value="">—</option>
      {!connu && <option value={value!}>{value}</option>}
      <optgroup label="Recherche de fonds">
        {PROFILS_RECHERCHE_FONDS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </optgroup>
      <optgroup label="Administration">
        {PROFILS_ADMIN_RESERVE.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </optgroup>
      <option value="__autre">Autre…</option>
    </select>
  );
}

/** Cellules Suivi / État / Commentaire / Réservé à d'une ligne (donateurs et prospects). */
export function CellulesSuivi({
  historique,
  peutSuivre,
  onAjouter,
  reserve,
  reserveBusy,
  onReserver,
  nom,
}: {
  historique: SuiviAction[] | undefined;
  peutSuivre: boolean;
  onAjouter: () => void;
  reserve: string | null;
  reserveBusy: boolean;
  onReserver: (v: string) => void;
  nom: string;
}) {
  const dernier = historique?.[0];
  const com = dernierCommentaire(historique);
  return (
    <>
      <td className="px-4 py-3">
        <div className="flex items-start gap-1">
          <div className="flex flex-wrap gap-1" title={dernier ? `Dernière action le ${formatDateHeure(dernier.cree_le)} par ${dernier.auteur}` : undefined}>
            {dernier ? (
              dernier.actions.map((a) => (
                <span key={a} className="whitespace-nowrap rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium">
                  {a}
                </span>
              ))
            ) : (
              <span className="text-muted">—</span>
            )}
          </div>
          {peutSuivre && (
            <button
              type="button"
              onClick={onAjouter}
              title="Ajouter une action"
              aria-label={`Ajouter une action : ${nom}`}
              className="rounded px-1.5 text-sm font-semibold text-accent hover:bg-accent-soft"
            >
              +
            </button>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3">{etatCourant(historique) ?? <span className="text-muted">—</span>}</td>
      <td className="max-w-56 px-4 py-3 text-muted">
        <span className="line-clamp-2" title={com ?? undefined}>
          {com ?? "—"}
        </span>
      </td>
      <td className="px-4 py-3">
        {peutSuivre ? (
          <ChoixReserve key={reserve ?? ""} value={reserve} disabled={reserveBusy} onChange={onReserver} compact label={`Réservé à : ${nom}`} />
        ) : (
          reserve ?? <span className="text-muted">—</span>
        )}
      </td>
    </>
  );
}
