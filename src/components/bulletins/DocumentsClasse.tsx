"use client";

import { todayISO } from "@/lib/format";
import { createPortal } from "react-dom";
import { Fragment, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { estSynthese, nomEleve, note20, trimestreEnLettres, type Enseignant, type Matiere, type Periode, type Statut, type Synthese, niveauDe, type EleveBulletin } from "@/lib/bulletins";
import { telechargerBulletins } from "@/lib/bulletinPdf";
import {
  matieresAvecAppreciation,
  syntheseReleve,
  syntheseTrimestre,
  titreTrimestre,
  type ContexteDocs,
  type DocReleve,
  type DocTrimestre,
} from "@/lib/relevesTrimestre";
import { BoutonEnregistrer, BoutonLot, CommutateurPret, confirmerPret, ZoneAppreciation } from "./outils";
import { enregistrerTout } from "@/lib/sauvegardeAuto";

const OUVERTS: Statut[] = ["nouveau", "en_cours"];

/**
 * Relevés de notes (une période : notes seules, appréciation générale) ou bulletins trimestriels (moyennes simples,
 * une appréciation par matière (son professeur ou la titulaire), appréciation du trimestre de la titulaire). Même circuit
 * que les bulletins : Prêt (titulaire), Validé puis Publié (Directrice) ; la famille lit les documents publiés.
 */
export default function DocumentsClasse({
  mode,
  ctx,
  periode,
  directrice,
  titulaire,
  enseignantId,
  peutApprecier,
  nomTitulaire,
  enseignants,
  onRecharger,
  emplacement,
}: {
  mode: "releve" | "trimestre";
  ctx: ContexteDocs;
  periode: Periode;
  directrice: boolean;
  titulaire: boolean;
  enseignantId: string | null;
  /** Appréciation d'une matière (le Catéchisme est réservé au Directeur spirituel). */
  peutApprecier?: (m: Matiere) => boolean;
  nomTitulaire: string | null;
  enseignants: Map<string, Enseignant>;
  onRecharger: () => Promise<void>;
  /** Barre de la page où se placent les boutons d'état (une seule tuile en haut). */
  emplacement?: HTMLElement | null;
}) {
  const sb = useMemo(() => createClient(), []);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const table = mode === "releve" ? "releves_notes" : "bulletins_trimestre";
  const docs: (DocReleve | DocTrimestre)[] = mode === "releve" ? ctx.releves : ctx.trimestriels;
  const docDe = (eleveId: string) => docs.find((d) => d.eleve_id === eleveId);
  const outils = { titulaire: nomTitulaire, enseignants };
  const avecAppreciation = mode === "trimestre" ? matieresAvecAppreciation(ctx) : [];
  const peutNoter = (m: Matiere) => directrice || titulaire || (!!enseignantId && m.enseignants.includes(enseignantId));
  const peutEditer = (d: { statut: Statut } | undefined) => !!d && (directrice || (titulaire && OUVERTS.includes(d.statut)));

  const synthese = (eleveId: string): Synthese | null => {
    const e = ctx.eleves.find((x) => x.id === eleveId);
    const d = docDe(eleveId);
    if (!e) return null;
    if (d?.statut === "publie" && estSynthese(d.synthese)) return d.synthese;
    return mode === "releve" ? syntheseReleve(ctx, periode, e, d as DocReleve | undefined, outils) : syntheseTrimestre(ctx, e, d as DocTrimestre | undefined, outils);
  };

  async function agir(p: PromiseLike<{ error: { message: string } | null }>) {
    setOccupe(true);
    const { error } = await p;
    setOccupe(false);
    setMessage(error ? `Échec : ${error.message}` : null);
    if (!error) await onRecharger();
  }

  // Appréciations enregistrées d'elles-mêmes (sans recharger à chaque frappe) ; le bouton du bas relit tout.
  const ecrire = async (p: PromiseLike<{ error: { message: string } | null }>) => (await p).error?.message ?? null;
  const haut = useRef<HTMLDivElement>(null);

  const cible = docs;
  const changer = (statut: Statut) => agir(sb.rpc("releves_changer_statut", { p_doc: mode, p_ids: cible.map((d) => d.id), p_statut: statut }));
  const publier = () => {
    const items = cible.filter((d) => d.statut === "valide").map((d) => ({ id: d.id, synthese: synthese(d.eleve_id) }));
    return agir(sb.rpc("releves_publier", { p_doc: mode, p_items: items }));
  };
  const pdf = async () => {
    const ss = docs.map((d) => synthese(d.eleve_id)).filter((s): s is Synthese => !!s);
    await telechargerBulletins(ss, `${mode === "releve" ? "Relevés de notes" : "Bulletins"} ${ctx.classe.nom} - ${mode === "releve" ? `Période ${periode.ordre}` : titreTrimestre(ctx.trimestre)}`);
  };

  // Classe à plusieurs niveaux : élèves regroupés par niveau (CE1, puis CE2…), puis par nom.
  const multiNiveaux = ctx.classe.niveaux.length > 1;
  const niveauEleve = (e: EleveBulletin) => niveauDe(e, ctx.classe.annee_scolaire) ?? "";
  const eleves = [...ctx.eleves].sort((a, b) => (multiNiveaux ? niveauEleve(a).localeCompare(niveauEleve(b)) : 0) || nomEleve(a).localeCompare(nomEleve(b), "fr"));
  const n = (s: Statut) => cible.filter((d) => d.statut === s).length;
  // Vue compacte : un élève à la fois, choisi dans une barre horizontale (« Tous » : la liste complète).
  const [tous, setTous] = useState(false);
  const [courant, setCourant] = useState<string | null>(null);
  const idCourant = eleves.some((e) => e.id === courant) ? courant : (eleves[0]?.id ?? null);
  const rang = eleves.findIndex((e) => e.id === idCourant);
  const affiches = tous ? eleves : eleves.filter((e) => e.id === idCourant);
  // Navigation circulaire : avant le premier élève vient le dernier, après le dernier revient le premier.
  const nbEleves = eleves.length;
  const precedent = nbEleves > 1 && rang >= 0 ? eleves[(rang - 1 + nbEleves) % nbEleves] : undefined;
  const suivant = nbEleves > 1 && rang >= 0 ? eleves[(rang + 1) % nbEleves] : undefined;
  // Changer d'élève : les saisies en attente partent d'abord, puis l'en-tête de l'élève revient en vue.
  const allerA = (id: string) => {
    void enregistrerTout();
    setTous(false);
    setCourant(id);
    // Remonter jusqu'en haut des blocs de prénoms (la navigation reste sous les yeux), pas jusqu'au titre de l'élève.
    window.requestAnimationFrame(() => document.getElementById("blocs-eleves")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const groupesNiveau = eleves.reduce<{ niveau: string; eleves: EleveBulletin[] }[]>((acc, e) => {
    const nv = multiNiveaux ? niveauEleve(e) : "";
    const g = acc.find((x) => x.niveau === nv);
    if (g) g.eleves.push(e);
    else acc.push({ niveau: nv, eleves: [e] });
    return acc;
  }, []);

  const boutons = (
    <div className="ml-auto flex flex-wrap gap-2">
            {(directrice || titulaire) && (
          <CommutateurPret
            publie={(mode === "releve" && periode.fin < todayISO()) || (docs.length > 0 && docs.every((d) => d.statut === "publie"))}
            pret={docs.length > 0 && docs.every((d) => ["pret", "valide", "publie"].includes(d.statut))}
            onChange={(v) => (v && !directrice && !confirmerPret() ? undefined : changer(v ? "pret" : "en_cours"))}
            disabled={occupe || !docs.length}
            titre={mode === "releve" ? "Relevés : En cours / Prêt" : "Bulletins : En cours / Prêt"}
          />
        )}
            {directrice && (
              <>
                <BoutonLot n={n("nouveau") + n("en_cours") + n("pret")} onClick={() => changer("valide")} disabled={occupe}>
                  Valider
                </BoutonLot>
                <BoutonLot n={n("valide")} onClick={publier} fort disabled={occupe}>
                  Publier aux familles
                </BoutonLot>
              </>
            )}
            {directrice && <BoutonLot onClick={pdf}>PDF de la classe</BoutonLot>}
          </div>
  );

  // Bouton d'élève précédent / suivant (haut et bas de la fiche) ; le passage à un autre niveau est signalé.
  const boutonNav = (cible: EleveBulletin | undefined, suivant: boolean) => {
    const changeNiveau = !!cible && multiNiveaux && niveauEleve(cible) !== niveauEleve(eleves[rang]);
    return (
      <button
        key={suivant ? "suivant" : "precedent"}
        type="button"
        disabled={!cible}
        onClick={() => cible && allerA(cible.id)}
        className={`flex min-h-[2.55rem] w-auto min-w-0 flex-1 items-center gap-1.5 rounded-lg border px-2 py-1 text-left md:min-h-0 md:flex-none md:shrink-0 transition-colors disabled:opacity-30 md:w-56 md:max-w-[45%] md:gap-2 md:px-3 md:py-1.5 ${suivant ? "order-2 flex-row-reverse text-right md:order-3" : "order-1"} ${
          changeNiveau ? "border-gold/50 bg-gold-soft/30 hover:bg-gold-soft/60" : "border-border bg-surface hover:bg-accent-soft/50"
        }`}
      >
        <span className="text-lg leading-none text-accent">{suivant ? "›" : "‹"}</span>
        <span className="min-w-0">
          {cible ? (
            <span className="block text-[12.5px] font-semibold leading-tight">
              {cible.prenom ?? ""} {(cible.nom ?? "").trim().charAt(0).toUpperCase()}.
            </span>
          ) : (
            <span className="block text-[13px] text-muted">{suivant ? "Dernier élève" : "Premier élève"}</span>
          )}
          {changeNiveau && <span className="mt-0.5 inline-block rounded bg-gold-soft px-1.5 text-[10.5px] font-bold leading-[1.25] text-gold">Vers {niveauEleve(cible!) || "?"}</span>}
        </span>
      </button>
    );
  };

  return (
    <div ref={haut} className="mx-auto max-w-5xl scroll-mt-4 space-y-3">
      {emplacement && createPortal(boutons, emplacement)}
      {(!emplacement || message) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-surface px-2 py-1 text-[13px]">
        {!emplacement && (
        <span className="font-semibold">
          {mode === "releve" ? `Relevés de notes · Période ${periode.ordre}` : `Bulletins · ${trimestreEnLettres(ctx.trimestre)}`}
        </span>
        )}
        {!emplacement && boutons}
        {message && <p className="w-full text-[12.5px] text-negative">{message}</p>}
        </div>
      )}

      {!eleves.length && <p className="text-sm text-muted">Aucun élève dans cette classe.</p>}
      {eleves.length > 0 && (
        <div id="blocs-eleves" className="scroll-mt-[70px] rounded-xl border border-border bg-surface p-1 md:scroll-mt-2">
          <div className="flex items-center gap-2">
            {/* Un bouton par élève. Classe à plusieurs niveaux : un bloc horizontal par niveau (élèves à la suite), blocs
                empilés ; sinon, les élèves à la suite. */}
            <div className="flex min-w-0 flex-1 flex-row flex-wrap items-start justify-center gap-x-4 gap-y-1.5">
              {groupesNiveau.map((g) => (
                <div
                  key={g.niveau}
                  className="flex flex-wrap items-center gap-1"
                >
                  {multiNiveaux && <span className="mr-0.5 flex w-16 shrink-0 items-center justify-center rounded border border-transparent bg-gold-soft px-2.5 py-1 text-center text-[12.5px] font-bold text-gold">{g.niveau || "?"}</span>}
                  {g.eleves.map((e) => {
                    const choisi = !tous && e.id === idCourant;
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => {
                          setTous(false);
                          setCourant(e.id);
                        }}
                        title={`${nomEleve(e)}${g.niveau ? ` · ${g.niveau}` : ""}`}
                        className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-left text-[12.5px] ${
                          choisi ? "border-accent bg-accent text-accent-fg" : "border-border bg-background hover:bg-accent-soft"
                        }`}
                      >
                        {e.prenom ?? nomEleve(e)}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {affiches.map((e, k) => {
          const nouveauNiveau = tous && multiNiveaux && (k === 0 || niveauEleve(affiches[k - 1]) !== niveauEleve(e));
          const d = docDe(e.id);
          const s = synthese(e.id);
          const champ = "w-full rounded-md border border-border bg-background px-2 py-1 text-[12.5px] text-foreground outline-none focus:border-accent read-only:border-transparent read-only:bg-transparent";
          return (
            <Fragment key={e.id}>
            {nouveauNiveau && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border-l-4 border-gold bg-gold-soft/50 px-3 py-1 text-[12.5px] font-semibold text-gold">
                {niveauEleve(e) || "Niveau non renseigné"} · {eleves.filter((x) => niveauEleve(x) === niveauEleve(e)).length} élève(s)
              </div>
            )}
            <div id={!tous ? "bulletin-eleve" : undefined} className="scroll-mt-[70px] rounded-xl border border-border bg-surface p-2.5 md:scroll-mt-2">
              {/* En-tête de l'élève : reste affiché au défilement (un élève à la fois), avec la navigation ‹ › . */}
              <div className={`mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 ${!tous ? "sticky top-[62px] z-10 -mx-2.5 -mt-2.5 md:top-0 rounded-t-xl border-b border-border bg-surface px-2.5 py-2 shadow-sm" : ""}`}>
                {!tous && eleves.length > 1 && boutonNav(precedent, false)}
                <div className="order-3 min-w-0 flex-1 basis-full text-center md:order-2 md:basis-40">
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <span className="font-medium">
                      <span className="md:hidden">
                        {e.prenom ?? ""} {(e.nom ?? "").trim().charAt(0).toUpperCase()}.
                      </span>
                      <span className="hidden md:inline">{nomEleve(e)}</span>
                    </span>
                    {multiNiveaux && niveauEleve(e) && <span className="hidden rounded bg-gold-soft px-1.5 py-0.5 text-[11px] font-bold text-gold md:inline">{niveauEleve(e)}</span>}
                  </div>
                  <div className="text-[12.5px] text-muted">
                    {mode === "trimestre" && s?.general.moy != null && (
                      <>
                        <span className="text-[11px]">Moyenne générale</span> <strong className="text-accent">{note20(s.general.moy)}</strong>
                      </>
                    )}
                  </div>
                </div>
                {!tous && eleves.length > 1 && boutonNav(suivant, true)}
              </div>

              {/* Le document, ligne par ligne : l'appréciation de chaque matière face à sa moyenne. */}
              {s && s.groupes.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[28rem] text-[12.5px]">
                    <tbody>
                      {s.groupes.map((g) => (
                        <Fragment key={g.nom}>
                          <tr className="bg-gold-soft/50 font-semibold">
                            <td className="px-2 py-1">{g.nom}</td>
                            <td className="px-2 py-1 text-center tabular-nums">{mode === "trimestre" && !g.matieres.every((m) => m.appreciationSeule) ? note20(g.chiffre.moy) : ""}</td>
                            <td />
                          </tr>
                          {g.matieres.map((m) => {
                            const mat = avecAppreciation.find((x) => x.nom === m.nom);
                            const a = mat && d ? ctx.appreciations.find((x) => x.bulletin_id === d.id && x.matiere_id === mat.id) : undefined;
                            const modifiable = !!mat && !!d && (peutApprecier ?? peutNoter)(mat) && (directrice || OUVERTS.includes(d.statut));
                            return (
                              <tr key={m.nom} className="border-t border-border/60 align-middle">
                                <td className="w-[9rem] px-2 py-0.5 pl-4">{m.nom}</td>
                                <td className={`px-2 py-0.5 ${mode === "trimestre" ? "w-[4.5rem] text-center tabular-nums" : "text-muted"}`}>
                                  {m.appreciationSeule ? "" : mode === "trimestre" ? note20(m.chiffre.moy) : m.commentaire ?? "–"}
                                </td>
                                <td className="px-1 py-0.5">
                                  {mat && d ? (
                                    <div className="max-w-[36rem]">
                                    <ZoneAppreciation
                                      key={`${d.id}:${mat.id}`}
                                      valeur={a?.texte ?? ""}
                                      readOnly={!modifiable}
                                      rows={1}
                                      placeholder={modifiable ? `Appréciation · ${m.nom}` : ""}
                                      onEnregistrer={(v) => ecrire(sb.from("bulletins_trimestre_appreciations").upsert({ bulletin_id: d.id, matiere_id: mat.id, texte: v.trim() || null }))}
                                      className={`${champ} min-h-[1.9rem] resize-y`}
                                    />
                                    </div>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {d && (
                <div className="mt-1.5 flex items-start gap-2 border-t border-border pt-1.5">
                  <span className="w-[9rem] shrink-0 px-2 pt-1 text-[12.5px] font-semibold">{mode === "trimestre" ? "Appréciation du trimestre" : "Appréciation générale"}</span>
                  <div className="w-full max-w-[36rem]">
                  <ZoneAppreciation
                    key={d.id}
                    valeur={d.appreciation ?? ""}
                    readOnly={!peutEditer(d)}
                    rows={2}
                    onEnregistrer={(v) => ecrire(sb.from(table).update({ appreciation: v.trim() || null }).eq("id", d.id))}
                    className={champ}
                  />
                  </div>
                </div>
              )}
            </div>
            </Fragment>
          );
        })}
      </div>
      {/* Navigation d'un élève à l'autre, en bas du bulletin (le passage à un autre niveau est signalé). */}
      {!tous && eleves.length > 1 && (
        <div className="flex flex-wrap items-stretch justify-center gap-2">
          {[precedent, suivant].map((cible, i) => boutonNav(cible, i === 1))}
        </div>
      )}
      <BoutonEnregistrer
        onFini={() => {
          void onRecharger();
          haut.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />
    </div>
  );
}
