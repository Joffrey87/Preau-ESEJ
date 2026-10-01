"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatEuros } from "@/lib/format";
import { inputCls } from "./GestionComptes";
import { usePrenom } from "@/components/PrenomRecherche";
import HistoriqueRecherche from "@/components/HistoriqueRecherche";
import {
  MEMBRES,
  PILIERS,
  STATUTS_ACTION,
  dateHeure,
  formatCible,
  libelleStatutAction,
  titrePilier,
  tracer,
  type Action,
  type EcritureLiee,
  type Etape,
  type Idee,
  type NoteJournal,
  type Pilier,
  type StatutAction,
} from "@/lib/rechercheFonds";

type Donnees = {
  actions: Action[];
  idees: Idee[];
  etapes: Etape[];
  journal: NoteJournal[];
  ecritures: EcritureLiee[];
};

/**
 * Onglet « Suivi des actions » : une fiche par idée retenue. En haut, les
 * actions vivantes (en cours, à lancer, en pause) ; en bas, terminées et
 * abandonnées. Chacun se positionne (porteur ou contributeur) sous son prénom.
 */
export default function SuiviActions({
  donnees,
  actionInitiale,
  estTresorerie,
}: {
  donnees: Donnees;
  actionInitiale: string | null;
  /** Président / Trésorier : peuvent lier des écritures de la Comptabilité. */
  estTresorerie: boolean;
}) {
  const [ouverte, setOuverte] = useState<string | null>(actionInitiale);
  const [filtrePilier, setFiltrePilier] = useState<Pilier | "">("");
  const [voirCloses, setVoirCloses] = useState(false);

  const ideeDe = new Map(donnees.idees.map((i) => [i.id, i]));
  // Une action n'est suivie que si son idée est (toujours) retenue.
  const suivies = donnees.actions.filter((a) => {
    const i = a.idee_id ? ideeDe.get(a.idee_id) : undefined;
    return (!a.idee_id || (i && i.statut === "retenue")) && (!filtrePilier || i?.pilier === filtrePilier);
  });
  const deStatut = (s: StatutAction) => suivies.filter((a) => a.statut === s);
  const closes = suivies.filter((a) => a.statut === "terminee" || a.statut === "abandonnee");
  const action = donnees.actions.find((a) => a.id === ouverte) ?? null;

  const carte = (a: Action) => {
    const i = a.idee_id ? ideeDe.get(a.idee_id) : undefined;
    const et = donnees.etapes.filter((e) => e.action_id === a.id);
    const faites = et.filter((e) => e.fait).length;
    const obtenu = a.montant_obtenu;
    return (
      <button
        key={a.id}
        type="button"
        onClick={() => setOuverte(a.id)}
        className="mb-2 w-full rounded-lg border border-border bg-surface p-3 text-left text-sm shadow-sm hover:border-accent/50"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-medium">
            {i?.nouvelle && <span className="mr-1 text-[#c8952f]">★</span>}
            {a.titre}
          </span>
          {i && <span className="shrink-0 rounded bg-[#14295c] px-1.5 text-[11px] font-semibold text-[#c8952f]">{i.pilier}</span>}
        </div>
        <div className="mt-1 text-xs text-muted">
          {a.porteur ? (
            <>Porteur : <span className="font-medium text-foreground">{a.porteur}</span></>
          ) : (
            <span className="text-amber-700 dark:text-amber-300">Sans porteur</span>
          )}
          {a.contributeurs.length > 0 && <> · avec {a.contributeurs.join(", ")}</>}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
          {et.length > 0 && <span>Étapes {faites}/{et.length}</span>}
          {(a.objectif_valeur != null || obtenu != null) && (
            <span>
              {obtenu != null ? `${formatEuros(Number(obtenu))} obtenus` : "—"}
              {a.objectif_valeur != null ? ` / ${formatCible(a.objectif_valeur, a.objectif_unite)}` : ""}
            </span>
          )}
        </div>
      </button>
    );
  };

  const chip = (actif: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium ${actif ? "bg-accent text-accent-fg" : "border border-border text-muted hover:bg-surface-2"}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setFiltrePilier("")} className={chip(!filtrePilier)}>Tous les piliers</button>
        {PILIERS.map((p) => (
          <button key={p.code} type="button" onClick={() => setFiltrePilier(filtrePilier === p.code ? "" : p.code)} className={chip(filtrePilier === p.code)} title={p.titre}>
            {p.code} · {p.titre}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <HistoriqueRecherche />
          <Link href="/recherche/axes" className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2">Axes de recherche</Link>
        </div>
      </div>

      {suivies.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-12 text-center text-sm text-muted">
          Aucune action pour l&apos;instant. Dans « Axes de recherche », passez une idée en « Retenue » : sa fiche apparaîtra ici.
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            {STATUTS_ACTION.filter((s) => s.actif).map((s) => (
              <div key={s.v} className="rounded-xl border border-border bg-surface-2/40 p-2">
                <div className="mb-2 flex items-center justify-between px-1 text-sm font-semibold">
                  {s.l}
                  <span className="text-xs font-normal text-muted">{deStatut(s.v).length}</span>
                </div>
                {deStatut(s.v).map(carte)}
              </div>
            ))}
          </div>

          {closes.length > 0 && (
            <div className="mt-4">
              <button type="button" onClick={() => setVoirCloses((v) => !v)} className="text-sm text-muted hover:underline">
                {voirCloses ? "▾" : "▸"} Terminées et abandonnées ({closes.length})
              </button>
              {voirCloses && (
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  {(["terminee", "abandonnee"] as const).map((s) => (
                    <div key={s} className="rounded-xl border border-border p-2 opacity-80">
                      <div className="mb-2 px-1 text-sm font-semibold">{libelleStatutAction(s)}</div>
                      {deStatut(s).map(carte)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {action && (
        <FicheAction
          action={action}
          idee={action.idee_id ? (ideeDe.get(action.idee_id) ?? null) : null}
          etapes={donnees.etapes.filter((e) => e.action_id === action.id).sort((a, b) => a.ordre - b.ordre)}
          journal={donnees.journal.filter((n) => n.action_id === action.id)}
          ecritures={donnees.ecritures.filter((e) => e.action_id === action.id)}
          estTresorerie={estTresorerie}
          onClose={() => setOuverte(null)}
        />
      )}
    </>
  );
}

function FicheAction({
  action,
  idee,
  etapes,
  journal,
  ecritures,
  estTresorerie,
  onClose,
}: {
  action: Action;
  idee: Idee | null;
  etapes: Etape[];
  journal: NoteJournal[];
  ecritures: EcritureLiee[];
  estTresorerie: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { prenom } = usePrenom();
  const [nouvelleEtape, setNouvelleEtape] = useState("");
  const [note, setNote] = useState("");
  const [obtenu, setObtenu] = useState(action.montant_obtenu != null ? String(action.montant_obtenu).replace(".", ",") : "");
  const [objectif, setObjectif] = useState(action.objectif_valeur != null ? String(action.objectif_valeur).replace(".", ",") : "");
  const [unite, setUnite] = useState(action.objectif_unite ?? "€");
  const [erreur, setErreur] = useState<string | null>(null);
  const supabase = createClient();
  const personnes = [...new Set([...MEMBRES, ...(prenom ? [prenom] : []), ...(action.porteur ? [action.porteur] : []), ...action.contributeurs])];

  async function maj(patch: Partial<Action>, evenement?: string) {
    setErreur(null);
    const { error } = await supabase.from("recherche_actions").update({ ...patch, modifie_le: new Date().toISOString() }).eq("id", action.id);
    if (error) return setErreur("Enregistrement impossible : " + error.message);
    if (evenement) await tracer(supabase, { prenom, objet: "action", objet_id: action.id, titre: action.titre, evenement });
    router.refresh();
  }

  const nombre = (t: string) => (t.trim() ? Number(t.replace(/\s/g, "").replace(",", ".")) : null);

  function mePositionner() {
    if (!prenom) return;
    if (!action.porteur) return maj({ porteur: prenom }, `porteur : ${prenom}`);
    if (action.porteur === prenom) return;
    const dedans = action.contributeurs.includes(prenom);
    const contributeurs = dedans ? action.contributeurs.filter((c) => c !== prenom) : [...action.contributeurs, prenom];
    return maj({ contributeurs }, dedans ? `${prenom} se retire` : `${prenom} contribue`);
  }

  async function ajouterEtape(e: React.FormEvent) {
    e.preventDefault();
    if (!nouvelleEtape.trim()) return;
    await supabase.from("recherche_etapes").insert({
      action_id: action.id,
      texte: nouvelleEtape.trim(),
      cree_par: prenom,
      ordre: (etapes.at(-1)?.ordre ?? 0) + 1,
    });
    setNouvelleEtape("");
    router.refresh();
  }

  async function cocher(et: Etape) {
    await supabase
      .from("recherche_etapes")
      .update({ fait: !et.fait, fait_par: !et.fait ? prenom : null, fait_le: !et.fait ? new Date().toISOString() : null })
      .eq("id", et.id);
    router.refresh();
  }

  async function retirerEtape(et: Etape) {
    await supabase.from("recherche_etapes").delete().eq("id", et.id);
    router.refresh();
  }

  async function ajouterNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    await supabase.from("recherche_journal").insert({ action_id: action.id, prenom, texte: note.trim() });
    setNote("");
    router.refresh();
  }

  const totalLie = ecritures.reduce((s, e) => s + (e.type === "depense" ? -1 : 1) * Number(e.montant ?? 0), 0);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl border border-border bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-3">
          <div>
            <h2 className="text-base font-semibold">
              {idee?.nouvelle && <span className="mr-1 text-[#c8952f]">★</span>}
              {action.titre}
            </h2>
            {idee && <div className="text-xs text-muted">Pilier {idee.pilier} · {titrePilier(idee.pilier)}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded p-1 text-muted hover:bg-surface-2">✕</button>
        </div>

        <div className="space-y-5 overflow-y-auto px-6 py-4 text-sm">
          {idee?.description && <p className="text-muted">{idee.description}</p>}

          {/* Statut */}
          <div>
            <div className="mb-1.5 font-medium">Statut</div>
            <div className="flex flex-wrap gap-2">
              {STATUTS_ACTION.map((s) => (
                <button
                  key={s.v}
                  type="button"
                  onClick={() => action.statut !== s.v && maj({ statut: s.v }, `→ ${s.l}`)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${action.statut === s.v ? s.cls : "border border-border hover:bg-surface-2"}`}
                >
                  {s.l}
                </button>
              ))}
            </div>
          </div>

          {/* Porteur et contributeurs */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 flex items-center justify-between font-medium">
                Porteur
                {prenom && action.porteur !== prenom && (
                  <button type="button" onClick={mePositionner} className="rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:opacity-90">
                    {!action.porteur ? "Je porte cette action" : action.contributeurs.includes(prenom) ? "Je me retire" : "Je contribue"}
                  </button>
                )}
              </div>
              <select
                value={action.porteur ?? ""}
                onChange={(e) => maj({ porteur: e.target.value || null }, e.target.value ? `porteur : ${e.target.value}` : "porteur retiré")}
                className={inputCls}
              >
                <option value="">— Sans porteur —</option>
                {personnes.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1.5 font-medium">Contributeurs</div>
              <div className="flex flex-wrap gap-1">
                {personnes.filter((p) => p !== action.porteur).map((p) => {
                  const actif = action.contributeurs.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() =>
                        maj(
                          { contributeurs: actif ? action.contributeurs.filter((c) => c !== p) : [...action.contributeurs, p] },
                          actif ? `${p} ne contribue plus` : `${p} contribue`,
                        )
                      }
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${actif ? "bg-accent text-accent-fg" : "border border-border text-muted hover:bg-surface-2"}`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Objectif et résultat */}
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
            <label className="block">
              <span className="mb-1 block font-medium">Objectif</span>
              <input value={objectif} onChange={(e) => setObjectif(e.target.value)} inputMode="decimal" className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block font-medium">Unité</span>
              <input value={unite} onChange={(e) => setUnite(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block font-medium">Obtenu (€)</span>
              <input value={obtenu} onChange={(e) => setObtenu(e.target.value)} inputMode="decimal" className={inputCls} />
            </label>
            <button
              type="button"
              onClick={() => {
                const o = nombre(objectif);
                const m = nombre(obtenu);
                if ((o != null && !Number.isFinite(o)) || (m != null && !Number.isFinite(m))) return setErreur("Montant invalide.");
                const change = m !== (action.montant_obtenu != null ? Number(action.montant_obtenu) : null);
                void maj(
                  { objectif_valeur: o, objectif_unite: unite.trim() || null, montant_obtenu: m },
                  change ? `obtenu : ${m != null ? formatEuros(m) : "—"}` : undefined,
                );
              }}
              className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2"
            >
              Enregistrer
            </button>
          </div>

          {/* Prochaines étapes */}
          <div>
            <div className="mb-1.5 font-medium">Prochaines étapes</div>
            <ul className="space-y-1">
              {etapes.map((et) => (
                <li key={et.id} className="group flex items-start gap-2">
                  <input type="checkbox" checked={et.fait} onChange={() => cocher(et)} className="mt-1 accent-amber-600" />
                  <span className={`flex-1 ${et.fait ? "text-muted line-through" : ""}`}>
                    {et.texte}
                    {et.fait && et.fait_par && (
                      <span className="ml-1 text-xs text-muted no-underline">({et.fait_par}{et.fait_le ? `, ${formatDate(et.fait_le.slice(0, 10))}` : ""})</span>
                    )}
                  </span>
                  <button type="button" onClick={() => retirerEtape(et)} aria-label="Retirer l'étape" className="text-xs text-muted opacity-0 hover:text-negative group-hover:opacity-100">✕</button>
                </li>
              ))}
            </ul>
            <form onSubmit={ajouterEtape} className="mt-2 flex gap-2">
              <input value={nouvelleEtape} onChange={(e) => setNouvelleEtape(e.target.value)} placeholder="Ajouter une étape (ex. solliciter 10 avis Google)" className={inputCls} />
              <button type="submit" className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2">Ajouter</button>
            </form>
          </div>

          {/* Écritures de Comptabilité liées */}
          <EcrituresLiees action={action} ecritures={ecritures} total={totalLie} estTresorerie={estTresorerie} prenom={prenom} />

          {/* Journal */}
          <div>
            <div className="mb-1.5 font-medium">Journal</div>
            <form onSubmit={ajouterNote} className="mb-2 flex gap-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ajouter une note (signée de votre prénom)" className={inputCls} />
              <button type="submit" className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2">Noter</button>
            </form>
            {journal.length > 0 && (
              <ul className="space-y-1.5">
                {[...journal].sort((a, b) => b.le.localeCompare(a.le)).map((n) => (
                  <li key={n.id} className="rounded-lg bg-surface-2/60 px-3 py-1.5">
                    <span className="text-xs text-muted">{dateHeure(n.le)} · <span className="font-medium text-foreground">{n.prenom ?? "—"}</span></span>
                    <div>{n.texte}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {erreur && <p className="rounded-lg bg-negative/10 px-3 py-2 text-negative">{erreur}</p>}
        </div>
      </div>
    </div>
  );
}

type OpTrouvee = { id: string; date_operation: string; libelle: string; montant: number; type: string; parent_id: string | null };

/** Écritures (mères ou sous-écritures) de la Comptabilité rattachées à l'action. */
function EcrituresLiees({
  action,
  ecritures,
  total,
  estTresorerie,
  prenom,
}: {
  action: Action;
  ecritures: EcritureLiee[];
  total: number;
  estTresorerie: boolean;
  prenom: string | null;
}) {
  const router = useRouter();
  const [cherche, setCherche] = useState(false);
  const [q, setQ] = useState("");
  const [trouvees, setTrouvees] = useState<OpTrouvee[]>([]);
  const supabase = createClient();

  async function chercher(e: React.FormEvent) {
    e.preventDefault();
    // Caractères réservés de la syntaxe de filtre retirés de la saisie.
    const t = q.trim().replace(/[,()%*]/g, " ").trim();
    if (!t) return;
    const montant = /^\d+([.,]\d{1,2})?$/.test(t) ? Number(t.replace(",", ".")) : null;
    const req = supabase.from("operations").select("id, date_operation, libelle, montant, type, parent_id").order("date_operation", { ascending: false }).limit(25);
    const { data } = montant != null ? await req.eq("montant", montant) : await req.or(`libelle.ilike.%${t}%,libelle_origine.ilike.%${t}%`);
    setTrouvees((data ?? []) as OpTrouvee[]);
  }

  async function lier(o: OpTrouvee) {
    await supabase.from("recherche_operations").insert({
      action_id: action.id,
      operation_id: o.id,
      date_operation: o.date_operation,
      libelle: o.libelle,
      montant: o.montant,
      type: o.type,
      lie_par: prenom,
    });
    await tracer(supabase, { prenom, objet: "action", objet_id: action.id, titre: action.titre, evenement: `écriture liée : ${o.libelle} (${formatEuros(Number(o.montant))})` });
    router.refresh();
  }

  async function delier(e: EcritureLiee) {
    await supabase.from("recherche_operations").delete().eq("id", e.id);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between font-medium">
        Écritures de la Comptabilité
        {estTresorerie && (
          <button type="button" onClick={() => setCherche((v) => !v)} className="text-xs font-normal text-accent hover:underline">
            {cherche ? "Fermer la recherche" : "+ Lier une écriture"}
          </button>
        )}
      </div>
      {ecritures.length === 0 ? (
        <p className="text-xs text-muted">Aucune écriture liée.{!estTresorerie ? " (Le Président ou le Trésorier peut en lier.)" : ""}</p>
      ) : (
        <ul className="space-y-0.5">
          {ecritures.map((e) => (
            <li key={e.id} className="group flex items-center gap-2">
              <span className="w-20 tabular-nums text-xs text-muted">{e.date_operation ? formatDate(e.date_operation) : "—"}</span>
              <span className="flex-1 truncate">{e.libelle}</span>
              <span className={`tabular-nums ${e.type === "depense" ? "text-negative" : "text-positive"}`}>
                {e.type === "depense" ? "−" : "+"}
                {formatEuros(Number(e.montant ?? 0))}
              </span>
              {estTresorerie && (
                <button type="button" onClick={() => delier(e)} aria-label="Délier" className="text-xs text-muted opacity-0 hover:text-negative group-hover:opacity-100">✕</button>
              )}
            </li>
          ))}
          <li className="flex justify-end border-t border-border pt-1 text-xs text-muted">Total lié : {formatEuros(total)}</li>
        </ul>
      )}
      {cherche && (
        <div className="mt-2 rounded-lg border border-border p-2">
          <form onSubmit={chercher} className="flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Libellé ou montant exact" className={inputCls} />
            <button type="submit" className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2">Chercher</button>
          </form>
          <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto">
            {trouvees.map((o) => (
              <li key={o.id} className="flex items-center gap-2 text-xs">
                <span className="w-20 tabular-nums text-muted">{formatDate(o.date_operation)}</span>
                <span className="flex-1 truncate">{o.parent_id ? "↳ " : ""}{o.libelle}</span>
                <span className="tabular-nums">{formatEuros(Number(o.montant))}</span>
                <button
                  type="button"
                  disabled={ecritures.some((e) => e.operation_id === o.id)}
                  onClick={() => lier(o)}
                  className="rounded border border-border px-2 py-0.5 hover:bg-surface-2 disabled:opacity-40"
                >
                  Lier
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
