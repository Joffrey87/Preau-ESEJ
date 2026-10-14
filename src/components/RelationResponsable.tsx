"use client";

import { useEffect, useState } from "react";
import { ChoixReserve } from "@/components/SuiviDonateur";
import { PROFILS_RECHERCHE_FONDS } from "@/lib/profilsContact";
import { PROFILS_ADMIN_RESERVE } from "@/lib/suiviDonateurs";

/** Cadre ambre léger qui signale le Responsable. */
const CADRE = "text-amber-700 dark:text-amber-300";

/**
 * Relation et Responsable dans une seule cellule. Par défaut, la personne de la Relation est aussi le Responsable
 * (texte ambre) ; « Responsable différent » affiche « Marie · Paul (Paul en ambre) ».
 * `responsable` vide = même personne que la relation.
 */
export default function RelationResponsable({
  relation, responsable, reservePour = null, peutRelation, peutResponsable, suggestions = [], nom, onEnregistrer, cible = "prospect",
}: {
  cible?: "donateur" | "prospect";
  relation: string | null;
  /** « Réservé à » (orange), distinct du Responsable (ambre). */
  reservePour?: string | null;
  responsable: string | null;
  peutRelation: boolean;
  peutResponsable: boolean;
  /** Relations déjà employées (en plus des prénoms et profils). */
  suggestions?: string[];
  nom: string;
  /** Enregistre ; `responsable` null = identique à la relation. Renvoie un message d'erreur ou null. */
  onEnregistrer: (relation: string, responsable: string | null, reservePour: string | null) => Promise<string | null>;
}) {
  const rel = (relation ?? "").trim();
  const resp = (responsable ?? "").trim();
  const different = !!resp && resp !== rel;
  const [ouvert, setOuvert] = useState(false);
  const [r, setR] = useState(rel);
  const [diff, setDiff] = useState(different);
  const [rp, setRp] = useState(resp);
  const rsv = (reservePour ?? "").trim();
  const [rv, setRv] = useState(rsv);
  const [aRv, setARv] = useState(!!rsv);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { if (!ouvert) { setR(rel); setDiff(different); setRp(resp); setRv(rsv); setARv(!!rsv); } }, [ouvert, rel, resp, different, rsv]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const modifiable = peutRelation || peutResponsable;
  const liste = [...new Set([...PROFILS_RECHERCHE_FONDS, ...PROFILS_ADMIN_RESERVE, ...suggestions])];
  const idListe = `rel-${nom.replace(/\W+/g, "-")}`;

    const modifie = r.trim() !== rel || diff !== different || (diff && rp.trim() !== resp) || aRv !== !!rsv || (aRv && rv.trim() !== rsv);
  async function valider() {
    setBusy(true);
    setErreur(null);
    const e = await onEnregistrer(peutRelation ? r.trim() : rel, diff && rp.trim() && rp.trim() !== r.trim() ? rp.trim() : null, aRv && rv.trim() ? rv.trim() : null);
    setBusy(false);
    if (e) return setErreur(e);
    setOuvert(false);
  }

  const legende = `En ambre : le Responsable (personne qui suit ce ${cible === "donateur" ? "donateur" : "prospect"}) · en orange : Réservé à (lui seul le contacte)`;
  const base = !rel && !resp ? (
    rsv ? null : <span className="text-muted">—</span>
  ) : different ? (
    <>{rel && <>{rel} · </>}<span className={CADRE}>{resp}</span></>
  ) : (
    <span className={CADRE}>{rel}</span>
  );
  const affichage = (
    <span title={different || !rel ? legende : `${legende} — ici, la Relation est aussi le Responsable`}>
      {base}
      {rsv && <>{base && " · "}<span className="font-medium text-orange-600 dark:text-orange-400">🔒 {rsv}</span></>}
    </span>
  );

  return (
    <span className="relative inline-block">
      {modifiable ? (
        <button type="button" onClick={() => setOuvert(true)} title="Modifier la relation et le responsable" className="rounded text-center hover:bg-surface-2">
          {affichage}
        </button>
      ) : affichage}
      {ouvert && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => (busy ? undefined : modifie ? void valider() : setOuvert(false))} title="Cliquer à côté enregistre" />
          <div className="absolute left-0 top-full z-20 mt-1 w-64 space-y-2 rounded-lg border border-border bg-surface p-3 text-left text-sm shadow-lg">
            <label className="block text-xs text-muted">Relation (qui l&apos;a amené)
              <input autoFocus type="text" list={idListe} value={r} disabled={!peutRelation} onChange={(e) => setR(e.target.value)} maxLength={120}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void valider(); } if (e.key === "Escape") setOuvert(false); }}
                placeholder="Prénom, profil ou nom libre…" className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground" />
              <datalist id={idListe}>{liste.map((x) => <option key={x} value={x} />)}</datalist>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={diff} disabled={!peutResponsable} onChange={(e) => setDiff(e.target.checked)} className="h-4 w-4" />
              Responsable différent
            </label>
            {diff && (
              <ChoixReserve value={rp || null} disabled={!peutResponsable} onChange={setRp} label={`Responsable : ${nom}`} />
            )}
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={aRv} disabled={!peutResponsable} onChange={(e) => setARv(e.target.checked)} className="h-4 w-4" />
              <span className="text-orange-600 dark:text-orange-400">Réservé à</span>
            </label>
            {aRv && <ChoixReserve value={rv || null} disabled={!peutResponsable} onChange={setRv} label={`Réservé à : ${nom}`} />}
            {erreur && <p className="text-xs text-negative">{erreur}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOuvert(false)} className="rounded-md border border-border px-2 py-1 text-xs">Annuler</button>
              <button type="button" onClick={() => void valider()} disabled={busy} className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-fg disabled:opacity-50">
                {busy ? "…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </>
      )}
    </span>
  );
}

/** Colonnes masquables, mémorisées pour chaque personne (profil + prénom) dans ce navigateur. */
export function useColonnesMasquees<K extends string>(cle: string) {
  const [masquees, setMasquees] = useState<K[]>([]);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try { const v = localStorage.getItem(cle); setMasquees(v ? JSON.parse(v) : []); } catch {}
  }, [cle]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const basculer = (k: K) => setMasquees((l) => {
    const n = l.includes(k) ? l.filter((x) => x !== k) : [...l, k];
    try { localStorage.setItem(cle, JSON.stringify(n)); } catch {}
    return n;
  });
  return { vis: (k: K) => !masquees.includes(k), basculer };
}

/** Bouton « Colonnes ▾ » et sa liste à cocher. */
export function ChoixColonnes<K extends string>({ colonnes, vis, basculer, pour }: {
  colonnes: readonly { key: K; label: string }[]; vis: (k: K) => boolean; basculer: (k: K) => void; pour: string | null;
}) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOuvert((v) => !v)} aria-expanded={ouvert}
        className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2">Colonnes ▾</button>
      {ouvert && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOuvert(false)} />
          <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-border bg-surface p-2 shadow-lg">
            {colonnes.map((c) => (
              <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-surface-2">
                <input type="checkbox" checked={vis(c.key)} onChange={() => basculer(c.key)} className="h-4 w-4" />
                {c.label}
              </label>
            ))}
            <p className="mt-1 px-2 text-[11px] text-muted">Mémorisé pour {pour ?? "ce profil"}.</p>
          </div>
        </>
      )}
    </div>
  );
}
