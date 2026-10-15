"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayISO } from "@/lib/format";
import { calculerClasse, libellePeriode, nomEnseignant, type ContexteClasse, type Enseignant, type Matiere, type Bulletin } from "@/lib/bulletins";
import { chargerClasse, chargerReferentiel, periodeCourante, type Referentiel } from "@/lib/bulletinsDonnees";
import ListeBulletins from "./ListeBulletins";
import FicheBulletin from "./FicheBulletin";
import ParametresBulletins from "./ParametresBulletins";
import ConseilClasse from "./ConseilClasse";
import Absences from "./Absences";
import ReleveMaternelle from "./ReleveMaternelle";
import { estMaternelle } from "@/lib/releveMaternelle";
import { chargerDocs, type ContexteDocs } from "@/lib/relevesTrimestre";
import DocumentsClasse from "./DocumentsClasse";
import ReleveClasse from "./ReleveClasse";
import Trombinoscope from "./Trombinoscope";
import InscriptionsDirectrice from "@/components/inscriptions/InscriptionsDirectrice";

export type Onglet = "releves" | "trimestre" | "bulletins" | "conseil" | "absences" | "maternelle" | "trombi" | "inscriptions" | "parametres";
// Onglets de « Notes & Bulletins » ; les autres (Appel & absences, Trombinoscope, Gestion des classes, Inscriptions)
// s'ouvrent par le menu latéral, sans cette barre.
const GROUPE_EVAL: Onglet[] = ["releves", "trimestre", "conseil", "maternelle", "bulletins"];
const ONGLETS: Onglet[] = ["releves", "trimestre", "bulletins", "conseil", "absences", "maternelle", "trombi", "inscriptions", "parametres"];

/** Ce que le compte peut faire dans la classe affichée (la base le garantit de son côté). */
export type Droits = {
  directrice: boolean;
  titulaire: boolean;
  enseignantId: string | null;
  peutNoter: (m: Matiere) => boolean;
  /** Mention, appréciation, statut Prêt : titulaire ou Directrice, tant que le bulletin n'est pas validé (Directrice : toujours). */
  peutEditer: (b: Bulletin | null) => boolean;
  /** Commentaire et moyenne d'une matière dans un bulletin. */
  peutCommenter: (m: Matiere, b: Bulletin | null) => boolean;
};

/** Nom de matière comparable (sans accents ni casse). */
const nomMatiere = (n: string) => n.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();

/** Ne garde d'un contexte que la matière donnée (avec ses évaluations, lignes, appréciations et groupes). */
function seulementMatiere<T extends { groupes: { id: string }[]; matieres: Matiere[]; evaluations: { matiere_id: string }[]; lignes: { matiere_id: string }[] }>(x: T, nom: string): T {
  const matieres = x.matieres.filter((m) => nomMatiere(m.nom) === nomMatiere(nom));
  const ids = new Set(matieres.map((m) => m.id));
  const groupes = new Set(matieres.map((m) => m.groupe_id));
  const r = {
    ...x,
    groupes: x.groupes.filter((g) => groupes.has(g.id)),
    matieres,
    evaluations: x.evaluations.filter((e) => ids.has(e.matiere_id)),
    lignes: x.lignes.filter((l) => ids.has(l.matiere_id)),
  };
  if ("appreciations" in x && Array.isArray(x.appreciations))
    return { ...r, appreciations: (x.appreciations as { matiere_id: string }[]).filter((a) => ids.has(a.matiere_id)) };
  return r;
}

export default function Bulletins({
  directrice,
  enseignantId,
  matiereSeule,
  initial,
}: {
  directrice: boolean;
  enseignantId: string | null;
  /** Directeur spirituel : seule cette matière (Catéchisme) est montrée, et seules les classes qui l'enseignent. */
  matiereSeule?: string;
  initial: { classe?: string; periode?: string; onglet?: string; bulletin?: string };
}) {
  const sb = useMemo(() => createClient(), []);
  const [ref, setRef] = useState<Referentiel | null>(null);
  const [classeId, setClasseId] = useState<string | null>(initial.classe ?? null);
  const [periodeId, setPeriodeId] = useState<string | null>(initial.periode ?? null);
  // « Notes » est fusionné dans « Relevés de notes » (saisie en ouvrant une matière) : les anciens liens y mènent.
  const ongletInitial = initial.onglet === "notes" ? "releves" : initial.onglet;
  const [onglet, setOnglet] = useState<Onglet>((ONGLETS.includes((ongletInitial ?? "") as Onglet) ? ongletInitial : "releves") as Onglet);
  const [docs, setDocs] = useState<ContexteDocs | null>(null);
  // Menu latéral (professeurs) : un lien vers un autre onglet change l'adresse ; l'écran suit.
  useEffect(() => {
    const o = (initial.onglet === "notes" ? "releves" : initial.onglet) as Onglet | undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- l'onglet suit l'adresse
    if (o && ONGLETS.includes(o)) setOnglet(o);
    // Lien « Notes & Bulletins » (sans onglet) : retour aux onglets d'évaluation.
    else setOnglet((cur) => (GROUPE_EVAL.includes(cur) ? cur : "releves"));
  }, [initial.onglet]);
  const [ajoutPour, setAjoutPour] = useState<string | null>(null);
  const [bulletinId, setBulletinId] = useState<string | null>(initial.bulletin ?? null);
  // Bulletin ouvert depuis le Conseil de classe : bouton de retour au Conseil.
  const [depuisConseil, setDepuisConseil] = useState(false);
  const [ctx, setCtx] = useState<ContexteClasse | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const chargerRef = useCallback(async () => {
    const r = await chargerReferentiel(sb);
    if (matiereSeule) {
      const { data } = await sb.from("matieres").select("classe_id, nom").eq("actif", true);
      const avec = new Set(((data ?? []) as { classe_id: string; nom: string }[]).filter((m) => nomMatiere(m.nom) === nomMatiere(matiereSeule)).map((m) => m.classe_id));
      r.classes = r.classes.filter((c) => avec.has(c.id));
    }
    setRef(r);
    return r;
  }, [sb, matiereSeule]);

  // Référentiel, puis choix par défaut : la classe dont on est titulaire, la période en cours.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement initial du référentiel
    chargerRef().then((r) => {
      const annees = [...new Set(r.classes.map((c) => c.annee_scolaire))].sort();
      const annee = annees.at(-1);
      const classes = r.classes.filter((c) => c.annee_scolaire === annee);
      setClasseId((id) => (id && r.classes.some((c) => c.id === id) ? id : (classes.find((c) => c.titulaire_id === enseignantId) ?? classes[0])?.id ?? null));
      setPeriodeId((id) =>
        id && r.periodes.some((p) => p.id === id) ? id : (periodeCourante(r.periodes.filter((p) => p.annee_scolaire === annee), todayISO())?.id ?? null),
      );
      if (!r.classes.length) setChargement(false);
    });
  }, [chargerRef, enseignantId]);

  const classe = ref?.classes.find((c) => c.id === classeId) ?? null;
  const periode = ref?.periodes.find((p) => p.id === periodeId) ?? null;

  const recharger = useCallback(async () => {
    if (!classe || !periode) return;
    setChargement(true);
    setErreur(null);
    try {
      const c = await chargerClasse(sb, classe, periode);
      setCtx(matiereSeule ? seulementMatiere(c, matiereSeule) : c);
      if (ref) {
        const d = await chargerDocs(sb, classe, periode, ref.periodes);
        setDocs(matiereSeule ? seulementMatiere(d, matiereSeule) : d);
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Chargement impossible.");
    } finally {
      setChargement(false);
    }
  }, [sb, classe, periode, ref, matiereSeule]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement des données de la classe choisie
    recharger();
  }, [recharger]);

  // L'adresse suit l'écran (lien partageable, retour au même endroit après rechargement).
  useEffect(() => {
    const q = new URLSearchParams();
    if (classeId) q.set("classe", classeId);
    if (periodeId) q.set("periode", periodeId);
    if (onglet !== "releves") q.set("onglet", onglet);
    if (bulletinId && onglet === "bulletins") q.set("bulletin", bulletinId);
    window.history.replaceState(null, "", `/bulletins?${q}`);
  }, [classeId, periodeId, onglet, bulletinId]);

  const resultats = useMemo(() => (ctx && ctx.classe.id === classeId && ctx.periode.id === periodeId ? calculerClasse(ctx) : []), [ctx, classeId, periodeId]);
  const enseignants = useMemo(() => new Map((ref?.enseignants ?? []).map((e) => [e.id, e] as [string, Enseignant])), [ref]);
  const titulaire = classe?.titulaire_id ? enseignants.get(classe.titulaire_id) : undefined;

  const droits: Droits = useMemo(() => {
    const estTitulaire = !!enseignantId && classe?.titulaire_id === enseignantId;
    const ouvert = (b: Bulletin | null) => !!b && ["nouveau", "en_cours", "pret"].includes(b.statut);
    const peutNoter = (m: Matiere) => directrice || estTitulaire || (!!enseignantId && m.enseignants.includes(enseignantId));
    return {
      directrice,
      titulaire: estTitulaire,
      enseignantId,
      peutNoter,
      peutEditer: (b) => !!b && (directrice || (estTitulaire && ouvert(b))),
      peutCommenter: (m, b) => !!b && peutNoter(m) && (directrice || ouvert(b)),
    };
  }, [directrice, enseignantId, classe]);

  if (!ref) return <div className="mx-auto max-w-7xl px-5 py-8 text-sm text-muted md:px-8">Chargement…</div>;

  const annee = classe?.annee_scolaire ?? ref.classes.at(-1)?.annee_scolaire ?? "";
  const classesAnnee = ref.classes.filter((c) => c.annee_scolaire === annee);
  const periodesAnnee = ref.periodes.filter((p) => p.annee_scolaire === annee);
  const onglets: { v: Onglet; label: string }[] = [
    { v: "releves", label: "Relevés de notes" },
    { v: "trimestre", label: "Bulletins" },
    { v: "conseil", label: "Conseil de classe" },
    { v: "absences", label: "Appel & absences" },
    ...(classe && estMaternelle(classe.niveaux) ? [{ v: "maternelle" as Onglet, label: "Relevé maternelle" }] : []),
    { v: "trombi", label: "Élèves" },
    // Bulletins de période d'avant (dont ceux repris d'École Futée) : conservés tels quels.
    { v: "bulletins", label: "Archives (périodes)" },
    ...(directrice ? [{ v: "inscriptions" as Onglet, label: "Inscriptions" }, { v: "parametres" as Onglet, label: "Gestion des classes" }] : []),
  ];

  const evaluation = GROUPE_EVAL.includes(onglet);
  const sansChoixClasse = onglet === "inscriptions" || onglet === "parametres";

  const choisirOnglet = (v: Onglet) => {
    setOnglet(v);
    setBulletinId(null);
    setDepuisConseil(false);
    setAjoutPour(null);
  };

  return (
    <div className="mx-auto max-w-7xl px-5 py-6 md:px-8">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Pages de l'École : le titre de l'onglet du menu, puis l'année en cours en gras. */}
        <h1 className="text-lg font-semibold tracking-tight">{evaluation ? "Notes & Bulletins" : onglets.find((o) => o.v === onglet)?.label}</h1>
        {annee && <p className="text-sm font-bold">Année {annee}</p>}
      </div>

      {!ref.classes.length ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">
          {directrice ? (
            <>
              Aucune classe n&apos;est encore définie.{" "}
              <button type="button" onClick={() => setOnglet("parametres")} className="font-medium text-accent hover:underline">
                Créer les classes
              </button>
            </>
          ) : (
            "Aucune classe ne vous est encore attribuée : la Directrice vous rattache à vos classes et matières."
          )}
        </div>
      ) : (
        <>
          {/* Barre de choix : classe, période, onglet (inutile pour les Inscriptions et la Gestion des classes). */}
          {!sansChoixClasse && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2">
            <div className="flex flex-wrap gap-1 rounded-lg bg-surface-2 p-1">
              {classesAnnee.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setClasseId(c.id);
                    setBulletinId(null);
                  }}
                  className={`rounded-md px-3 py-1 text-[13px] font-medium ${c.id === classeId ? "bg-surface text-accent shadow-sm" : "text-muted hover:text-foreground"}`}
                >
                  {c.nom}
                  <span className="ml-1.5 text-[11px] font-normal text-muted">{c.niveaux.join("·")}</span>
                </button>
              ))}
            </div>
            <select
              value={periodeId ?? ""}
              onChange={(e) => {
                setPeriodeId(e.target.value);
                setBulletinId(null);
              }}
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
              aria-label="Période"
            >
              {[1, 2, 3].map((t) => (
                <optgroup key={t} label={`${t === 1 ? "1er" : `${t}e`} trimestre`}>
                  {periodesAnnee
                    .filter((p) => p.trimestre === t)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        Période {p.ordre} — {libellePeriode(p)}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            {titulaire && <span className="text-[12px] text-muted">Titulaire : {nomEnseignant(titulaire)}</span>}
            {/* Onglets de Notes & Bulletins seulement ; les autres pages s'ouvrent par le menu latéral. */}
            {evaluation && (
              <div className="flex w-full flex-wrap items-center justify-start gap-2">
                <div className="flex flex-wrap gap-1 rounded-lg border border-border p-0.5">
                  {onglets
                    .filter((o) => GROUPE_EVAL.includes(o.v))
                    .map((o) => (
                      <button
                        key={o.v}
                        type="button"
                        onClick={() => choisirOnglet(o.v)}
                        className={`rounded-md px-2.5 py-1.5 text-[13px] font-medium ${onglet === o.v ? "bg-accent text-accent-fg" : "text-foreground hover:bg-surface-2"}`}
                      >
                        {o.label}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
          )}

          {erreur && <p className="mb-3 rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>}

          {onglet === "parametres" && directrice ? (
            <ParametresBulletins
              referentiel={ref}
              annee={annee}
              classeId={classeId}
              ajoutPour={ajoutPour}
              onRecharger={async () => {
                await chargerRef();
                await recharger();
              }}
            />
          ) : onglet === "inscriptions" && directrice ? (
            <InscriptionsDirectrice />
          ) : onglet === "trombi" && classe ? (
            <Trombinoscope classe={classe} directrice={directrice} />
          ) : onglet === "releves" && docs && periode && docs.classe.id === classeId && ctx && ctx.classe.id === classeId && ctx.periode.id === periodeId ? (
            <ReleveClasse
              key={`${classeId}:${periodeId}`}
              ctx={ctx}
              resultats={resultats}
              droits={droits}
              enseignants={enseignants}
              onMaj={setCtx}
              docs={docs}
              periode={periode}
              nomTitulaire={titulaire ? nomEnseignant(titulaire) : null}
              onRecharger={recharger}
            />
          ) : onglet === "trimestre" && docs && periode && docs.classe.id === classeId ? (
            <DocumentsClasse
              key={`${onglet}:${classeId}:${periodeId}`}
              mode="trimestre"
              ctx={docs}
              periode={periode}
              directrice={directrice}
              titulaire={droits.titulaire}
              enseignantId={enseignantId}
              nomTitulaire={titulaire ? nomEnseignant(titulaire) : null}
              enseignants={enseignants}
              onRecharger={recharger}
            />
          ) : !ctx || (chargement && !resultats.length) ? (
            <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">Chargement…</div>
          ) : onglet === "conseil" ? (
            <ConseilClasse
              ctx={ctx}
              resultats={resultats}
              droits={droits}
              onMaj={setCtx}
              onOuvrir={(id) => {
                setOnglet("bulletins");
                setBulletinId(id);
                setDepuisConseil(true);
              }}
            />
          ) : onglet === "absences" ? (
            <Absences classe={ctx.classe} periode={ctx.periode} eleves={ctx.eleves} peutSaisir={droits.directrice || droits.titulaire} directrice={droits.directrice}
              onOptionChangee={async () => {
                await chargerRef();
              }}
            />
          ) : onglet === "maternelle" ? (
            <ReleveMaternelle
              classe={ctx.classe}
              periode={ctx.periode}
              periodes={periodesAnnee}
              eleves={ctx.eleves}
              directrice={droits.directrice}
              titulaire={droits.titulaire}
              nomTitulaire={titulaire ? nomEnseignant(titulaire) : null}
            />
          ) : bulletinId && resultats.some((r) => r.bulletin?.id === bulletinId) ? (
            <>
              {depuisConseil && (
                <button
                  type="button"
                  onClick={() => {
                    setOnglet("conseil");
                    setBulletinId(null);
                    setDepuisConseil(false);
                  }}
                  className="mb-3 rounded-lg border border-border bg-surface px-3 py-1.5 text-[13px] font-medium text-accent hover:bg-accent-soft"
                >
                  ← Retour au Conseil de classe
                </button>
              )}
              <FicheBulletin
              ctx={ctx}
              resultats={resultats}
              bulletinId={bulletinId}
              droits={droits}
              enseignants={enseignants}
              titulaire={titulaire ? nomEnseignant(titulaire) : null}
              onNaviguer={setBulletinId}
              onMaj={setCtx}
              onRecharger={recharger}
            />
            </>
          ) : (
            <ListeBulletins
              ctx={ctx}
              resultats={resultats}
              droits={droits}
              enseignants={enseignants}
              titulaire={titulaire ? nomEnseignant(titulaire) : null}
              onOuvrir={setBulletinId}
              onRecharger={recharger}
            />
          )}
        </>
      )}
    </div>
  );
}
