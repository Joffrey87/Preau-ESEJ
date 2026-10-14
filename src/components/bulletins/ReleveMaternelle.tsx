"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { libellePeriode, niveauDe, nomEleve, type Classe, type EleveBulletin, type Periode } from "@/lib/bulletins";
import { resumeAbsences, type Absence } from "@/lib/absences";
import {
  NIVEAUX_ACQUIS,
  libelleTrimestre,
  statutReleve,
  type LigneReleve,
  type MatiereMaternelle,
  type NiveauAcquis,
  type ReleveMaternelle as Releve,
  type StatutReleve,
} from "@/lib/releveMaternelle";
import { telechargerRelevesMaternelle, type ReleveImprimable } from "@/lib/releveMaternellePdf";

const champ = "rounded-md border border-border bg-background px-2 py-1 text-[13px] outline-none focus:border-accent";
type Brouillon = { appreciation: string; lignes: Record<string, { niveau: NiveauAcquis | null; commentaire: string }> };

/**
 * Onglet « Relevé maternelle » (classes PS, MS, GS) : matières fixées pour la classe, puis pour chaque élève un niveau
 * et un commentaire par matière et une appréciation générale, par période ou par trimestre.
 * La titulaire saisit et marque « Prêt » ; seule la Directrice valide. Le PDF n'existe que pour un relevé validé.
 */
export default function ReleveMaternelle({
  classe,
  periode,
  periodes,
  eleves,
  directrice,
  titulaire,
  nomTitulaire,
}: {
  classe: Classe;
  periode: Periode;
  /** Périodes de l'année (pour les bornes d'un trimestre). */
  periodes: Periode[];
  eleves: EleveBulletin[];
  directrice: boolean;
  titulaire: boolean;
  nomTitulaire: string | null;
}) {
  const sb = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<"periode" | "trimestre">("trimestre");
  const trimestre = periode.trimestre ?? 1;
  const [matieres, setMatieres] = useState<MatiereMaternelle[]>([]);
  const [releves, setReleves] = useState<Releve[]>([]);
  const [lignes, setLignes] = useState<LigneReleve[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [eleveId, setEleveId] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [gererMatieres, setGererMatieres] = useState(false);
  const [nouvelle, setNouvelle] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const peutGerer = directrice || titulaire;
  const tries = useMemo(() => [...eleves].sort((a, b) => nomEleve(a).localeCompare(nomEleve(b), "fr")), [eleves]);
  const actives = matieres.filter((m) => m.actif);

  // Bornes du relevé : la période, ou toutes les périodes du trimestre.
  const bornes = useMemo(() => {
    if (mode === "periode") return { debut: periode.debut, fin: periode.fin, titre: `Période ${periode.ordre} — ${libellePeriode(periode)}` };
    const du = periodes.filter((p) => p.trimestre === trimestre);
    return {
      debut: du.length ? du.map((p) => p.debut).sort()[0] : periode.debut,
      fin: du.length ? du.map((p) => p.fin).sort().at(-1)! : periode.fin,
      titre: libelleTrimestre(trimestre),
    };
  }, [mode, periode, periodes, trimestre]);

  const charger = useCallback(async () => {
    const ids = eleves.map((e) => e.id);
    let q = sb.from("releves_maternelle").select("*").eq("classe_id", classe.id);
    q = mode === "periode" ? q.eq("periode_id", periode.id) : q.eq("annee_scolaire", classe.annee_scolaire).eq("trimestre", trimestre);
    const [m, r, a] = await Promise.all([
      sb.from("maternelle_matieres").select("*").eq("classe_id", classe.id).order("ordre").order("created_at"),
      q,
      ids.length ? sb.from("absences").select("*").in("eleve_id", ids).gte("date", bornes.debut).lte("date", bornes.fin) : Promise.resolve({ data: [] }),
    ]);
    const rel = (r.data ?? []) as Releve[];
    const l = rel.length ? await sb.from("releve_maternelle_lignes").select("*").in("releve_id", rel.map((x) => x.id)) : { data: [] };
    setMatieres((m.data ?? []) as MatiereMaternelle[]);
    setReleves(rel);
    setLignes((l.data ?? []) as LigneReleve[]);
    setAbsences((a.data ?? []) as Absence[]);
  }, [sb, classe.id, classe.annee_scolaire, eleves, mode, periode.id, trimestre, bornes.debut, bornes.fin]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement des relevés
    charger();
  }, [charger]);

  const releveDe = (id: string) => releves.find((r) => r.eleve_id === id) ?? null;
  const releve = eleveId ? releveDe(eleveId) : null;
  const modifiable = directrice || (titulaire && releve?.statut !== "valide");

  // Ouvre le brouillon de l'élève choisi.
  useEffect(() => {
    if (!eleveId) return;
    const r = releves.find((x) => x.eleve_id === eleveId) ?? null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- copie locale modifiable du relevé
    setBrouillon({
      appreciation: r?.appreciation ?? "",
      lignes: Object.fromEntries(
        matieres.map((m) => {
          const l = r ? lignes.find((x) => x.releve_id === r.id && x.matiere_id === m.id) : undefined;
          return [m.id, { niveau: l?.niveau ?? null, commentaire: l?.commentaire ?? "" }];
        }),
      ),
    });
  }, [eleveId, releves, lignes, matieres]);

  async function assurerReleve(id: string, champs: Partial<Releve>): Promise<string | null> {
    const existant = releveDe(id);
    if (existant) {
      const { error } = await sb.from("releves_maternelle").update(champs).eq("id", existant.id);
      if (error) throw new Error(error.message);
      return existant.id;
    }
    const { data, error } = await sb
      .from("releves_maternelle")
      .insert({
        classe_id: classe.id,
        eleve_id: id,
        annee_scolaire: classe.annee_scolaire,
        periode_id: mode === "periode" ? periode.id : null,
        trimestre: mode === "trimestre" ? trimestre : null,
        ...champs,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return (data as { id: string }).id;
  }

  async function enregistrer() {
    if (!eleveId || !brouillon) return;
    setEnvoi(true);
    setMessage(null);
    try {
      const id = await assurerReleve(eleveId, { appreciation: brouillon.appreciation.trim() || null });
      const lignesMaj = actives.map((m) => ({
        releve_id: id,
        matiere_id: m.id,
        niveau: brouillon.lignes[m.id]?.niveau ?? null,
        commentaire: brouillon.lignes[m.id]?.commentaire.trim() || null,
      }));
      if (lignesMaj.length) {
        const { error } = await sb.from("releve_maternelle_lignes").upsert(lignesMaj, { onConflict: "releve_id,matiere_id" });
        if (error) throw new Error(error.message);
      }
      setMessage("Relevé enregistré.");
      await charger();
    } catch (e) {
      setMessage(`Échec : ${e instanceof Error ? e.message : "enregistrement impossible"}`);
    } finally {
      setEnvoi(false);
    }
  }

  async function changerStatut(statut: StatutReleve) {
    if (!eleveId) return;
    if (statut === "valide" && !window.confirm("Valider ce relevé ? Il deviendra visible de la famille et imprimable.")) return;
    try {
      await assurerReleve(eleveId, { statut });
      setMessage(statut === "valide" ? "Relevé validé." : statut === "pret" ? "Relevé marqué prêt : la Directrice peut le valider." : "Relevé repassé en brouillon.");
      await charger();
    } catch (e) {
      setMessage(`Échec : ${e instanceof Error ? e.message : "changement impossible"}`);
    }
  }

  async function validerTous() {
    const prets = releves.filter((r) => r.statut === "pret");
    if (!prets.length || !window.confirm(`Valider les ${prets.length} relevé(s) prêt(s) ?`)) return;
    const { error } = await sb.from("releves_maternelle").update({ statut: "valide" }).in("id", prets.map((r) => r.id));
    setMessage(error ? `Échec : ${error.message}` : `${prets.length} relevé(s) validé(s).`);
    await charger();
  }

  // Matières de la classe.
  async function ajouterMatiere() {
    if (!nouvelle.trim()) return;
    const { error } = await sb.from("maternelle_matieres").insert({ classe_id: classe.id, nom: nouvelle.trim(), ordre: matieres.length });
    if (error) return setMessage(`Échec : ${error.message}`);
    setNouvelle("");
    await charger();
  }
  async function majMatiere(m: MatiereMaternelle, p: Partial<MatiereMaternelle>) {
    const { error } = await sb.from("maternelle_matieres").update(p).eq("id", m.id);
    if (error) return setMessage(`Échec : ${error.message}`);
    await charger();
  }
  async function deplacer(m: MatiereMaternelle, sens: -1 | 1) {
    const i = actives.findIndex((x) => x.id === m.id);
    const autre = actives[i + sens];
    if (!autre) return;
    await Promise.all([
      sb.from("maternelle_matieres").update({ ordre: i + sens }).eq("id", m.id),
      sb.from("maternelle_matieres").update({ ordre: i }).eq("id", autre.id),
    ]);
    await charger();
  }

  function imprimable(e: EleveBulletin): ReleveImprimable | null {
    const r = releveDe(e.id);
    if (!r || r.statut !== "valide") return null;
    return {
      eleve: { prenom: e.prenom ?? "", nom: e.nom, niveau: niveauDe(e, classe.annee_scolaire) },
      classe: { nom: classe.nom, titulaire: nomTitulaire },
      annee: classe.annee_scolaire,
      titre: bornes.titre,
      matieres: actives.map((m) => {
        const l = lignes.find((x) => x.releve_id === r.id && x.matiere_id === m.id);
        return { nom: m.nom, niveau: l?.niveau ?? null, commentaire: l?.commentaire ?? null };
      }),
      appreciation: r.appreciation,
      absences: resumeAbsences(absences.filter((a) => a.eleve_id === e.id)),
    };
  }
  const imprimables = tries.map(imprimable).filter((x): x is ReleveImprimable => !!x);
  const eleve = tries.find((e) => e.id === eleveId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3">
        <h3 className="mr-2 text-[14px] font-semibold">Relevé d&apos;appréciations</h3>
        <div className="flex gap-1 rounded-lg bg-surface-2 p-1">
          {(["trimestre", "periode"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1 text-[13px] font-medium ${mode === m ? "bg-surface text-accent shadow-sm" : "text-muted hover:text-foreground"}`}
            >
              {m === "trimestre" ? "Par trimestre" : "Par période"}
            </button>
          ))}
        </div>
        <span className="text-[12.5px] text-muted">{bornes.titre}</span>
        <div className="ml-auto flex gap-2">
          {peutGerer && (
            <button type="button" onClick={() => setGererMatieres(!gererMatieres)} className="rounded-lg border border-border px-3 py-1 text-[12.5px] hover:bg-surface-2">
              {gererMatieres ? "Fermer" : `Matières (${actives.length})`}
            </button>
          )}
          {directrice && releves.some((r) => r.statut === "pret") && (
            <button type="button" onClick={validerTous} className="rounded-lg border border-positive/40 px-3 py-1 text-[12.5px] text-positive hover:bg-positive/10">
              Valider les relevés prêts
            </button>
          )}
          <button
            type="button"
            disabled={!imprimables.length}
            title={imprimables.length ? undefined : "Aucun relevé validé"}
            onClick={() => telechargerRelevesMaternelle(imprimables, `Relevés ${classe.nom} — ${bornes.titre} ${classe.annee_scolaire}`)}
            className="rounded-lg bg-accent px-3 py-1 text-[12.5px] font-medium text-accent-fg disabled:opacity-50"
          >
            PDF de la classe ({imprimables.length})
          </button>
        </div>
      </div>

      {gererMatieres && peutGerer && (
        <div className="rounded-xl border border-border bg-surface">
          <p className="border-b border-border px-4 py-2 text-[12px] text-muted">Matières fixées pour la classe : reprises à chaque période et chaque trimestre.</p>
          <ul className="divide-y divide-border/60">
            {actives.map((m, i) => (
              <li key={m.id} className="flex items-center gap-2 px-4 py-1.5">
                <input defaultValue={m.nom} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== m.nom && majMatiere(m, { nom: e.target.value.trim() })} className={`${champ} flex-1`} />
                <button type="button" disabled={i === 0} onClick={() => deplacer(m, -1)} className="px-1 text-muted disabled:opacity-30" aria-label="Monter">↑</button>
                <button type="button" disabled={i === actives.length - 1} onClick={() => deplacer(m, 1)} className="px-1 text-muted disabled:opacity-30" aria-label="Descendre">↓</button>
                <button
                  type="button"
                  onClick={() => window.confirm(`Retirer « ${m.nom} » ? Les relevés déjà saisis la conservent en base.`) && majMatiere(m, { actif: false })}
                  className="text-muted hover:text-negative"
                  aria-label="Retirer"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 border-t border-border px-4 py-2">
            <input value={nouvelle} onChange={(e) => setNouvelle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ajouterMatiere()} placeholder="Nouvelle matière (ex. Langage oral)" className={`${champ} flex-1`} />
            <button type="button" onClick={ajouterMatiere} className="rounded-lg bg-accent px-3 py-1 text-[12.5px] font-medium text-accent-fg">
              Ajouter
            </button>
          </div>
        </div>
      )}

      {message && <p className={`text-[12.5px] ${message.startsWith("Échec") ? "text-negative" : "text-positive"}`}>{message}</p>}

      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <ul className="divide-y divide-border/60 self-start rounded-xl border border-border bg-surface">
          {tries.map((e) => {
            const s = statutReleve(releveDe(e.id)?.statut);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setEleveId(e.id)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] ${e.id === eleveId ? "bg-accent-soft" : "hover:bg-surface-2"}`}
                >
                  <span className="truncate font-medium">{nomEleve(e)}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] ${s.classe}`}>{releveDe(e.id) ? s.label : "—"}</span>
                </button>
              </li>
            );
          })}
          {!tries.length && <li className="px-3 py-2 text-[13px] text-muted">Aucun élève.</li>}
        </ul>

        {!eleve || !brouillon ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">
            {actives.length ? "Choisissez un élève." : "Commencez par définir les matières de la classe."}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              <h4 className="text-[14px] font-semibold">{nomEleve(eleve)}</h4>
              <span className="text-[12px] text-muted">{niveauDe(eleve, classe.annee_scolaire)}</span>
              <span className={`rounded px-1.5 py-0.5 text-[11px] ${statutReleve(releve?.statut).classe}`}>{statutReleve(releve?.statut).label}</span>
              <span className="text-[12px] text-muted">· {(() => { const r = resumeAbsences(absences.filter((a) => a.eleve_id === eleve.id)); return `${r.demiJournees} demi-journée(s) d'absence, ${r.retards} retard(s)`; })()}</span>
            </div>
            <ul className="divide-y divide-border/60">
              {actives.map((m) => {
                const l = brouillon.lignes[m.id] ?? { niveau: null, commentaire: "" };
                const maj = (p: Partial<typeof l>) => setBrouillon((b) => (b ? { ...b, lignes: { ...b.lignes, [m.id]: { ...l, ...p } } } : b));
                return (
                  <li key={m.id} className="space-y-1.5 px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-48 text-[13px] font-medium">{m.nom}</span>
                      {NIVEAUX_ACQUIS.map((n) => (
                        <button
                          key={n.v}
                          type="button"
                          disabled={!modifiable}
                          onClick={() => maj({ niveau: l.niveau === n.v ? null : n.v })}
                          className={`rounded-md border px-2.5 py-1 text-[12px] disabled:cursor-default ${l.niveau === n.v ? n.classe : "border-border text-muted hover:bg-surface-2"}`}
                        >
                          {n.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={l.commentaire}
                      disabled={!modifiable}
                      onChange={(e) => maj({ commentaire: e.target.value })}
                      rows={2}
                      placeholder="Commentaire"
                      className={`${champ} w-full`}
                    />
                  </li>
                );
              })}
            </ul>
            <div className="space-y-1.5 border-t border-border px-4 py-3">
              <label className="text-[13px] font-medium">Appréciation générale</label>
              <textarea
                value={brouillon.appreciation}
                disabled={!modifiable}
                onChange={(e) => setBrouillon({ ...brouillon, appreciation: e.target.value })}
                rows={3}
                className={`${champ} w-full`}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
              {modifiable && (
                <button type="button" onClick={enregistrer} disabled={envoi} className="rounded-lg bg-accent px-4 py-1.5 text-[13px] font-medium text-accent-fg disabled:opacity-50">
                  Enregistrer
                </button>
              )}
              {modifiable && releve && releve.statut === "brouillon" && (
                <button type="button" onClick={() => changerStatut("pret")} className="rounded-lg border border-border px-3 py-1.5 text-[13px] hover:bg-surface-2">
                  Marquer prêt
                </button>
              )}
              {releve && releve.statut === "pret" && (directrice || titulaire) && (
                <button type="button" onClick={() => changerStatut("brouillon")} className="rounded-lg border border-border px-3 py-1.5 text-[13px] hover:bg-surface-2">
                  Repasser en brouillon
                </button>
              )}
              {directrice && releve && releve.statut !== "valide" && (
                <button type="button" onClick={() => changerStatut("valide")} className="rounded-lg border border-positive/40 px-3 py-1.5 text-[13px] text-positive hover:bg-positive/10">
                  Valider
                </button>
              )}
              {directrice && releve?.statut === "valide" && (
                <button type="button" onClick={() => changerStatut("pret")} className="rounded-lg border border-border px-3 py-1.5 text-[13px] hover:bg-surface-2">
                  Retirer la validation
                </button>
              )}
              {!modifiable && <span className="text-[12px] text-muted">Relevé validé : seule la Directrice peut le modifier.</span>}
              <button
                type="button"
                disabled={releve?.statut !== "valide"}
                title={releve?.statut === "valide" ? undefined : "Imprimable une fois validé par la Directrice"}
                onClick={() => {
                  const r = imprimable(eleve);
                  if (r) telechargerRelevesMaternelle([r], `Relevé ${nomEleve(eleve)} — ${bornes.titre} ${classe.annee_scolaire}`);
                }}
                className="ml-auto rounded-lg border border-border px-3 py-1.5 text-[13px] hover:bg-surface-2 disabled:opacity-40"
              >
                PDF
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
