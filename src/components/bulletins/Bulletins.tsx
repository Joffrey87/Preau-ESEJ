"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PageHeader from "@/components/PageHeader";
import { todayISO } from "@/lib/format";
import { calculerClasse, libellePeriode, nomEnseignant, type ContexteClasse, type Enseignant, type Matiere, type Bulletin } from "@/lib/bulletins";
import { chargerClasse, chargerReferentiel, periodeCourante, type Referentiel } from "@/lib/bulletinsDonnees";
import ListeBulletins from "./ListeBulletins";
import FicheBulletin from "./FicheBulletin";
import SaisieNotes from "./SaisieNotes";
import ParametresBulletins from "./ParametresBulletins";
import ConseilClasse from "./ConseilClasse";
import Absences from "./Absences";
import ReleveMaternelle from "./ReleveMaternelle";
import { estMaternelle } from "@/lib/releveMaternelle";

export type Onglet = "bulletins" | "conseil" | "notes" | "absences" | "maternelle" | "parametres";

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

export default function Bulletins({
  directrice,
  enseignantId,
  initial,
}: {
  directrice: boolean;
  enseignantId: string | null;
  initial: { classe?: string; periode?: string; onglet?: string; bulletin?: string };
}) {
  const sb = useMemo(() => createClient(), []);
  const [ref, setRef] = useState<Referentiel | null>(null);
  const [classeId, setClasseId] = useState<string | null>(initial.classe ?? null);
  const [periodeId, setPeriodeId] = useState<string | null>(initial.periode ?? null);
  const [onglet, setOnglet] = useState<Onglet>((["bulletins", "conseil", "notes", "absences", "maternelle", "parametres"].includes(initial.onglet ?? "") ? initial.onglet : "bulletins") as Onglet);
  const [bulletinId, setBulletinId] = useState<string | null>(initial.bulletin ?? null);
  // Bulletin ouvert depuis le Conseil de classe : bouton de retour au Conseil.
  const [depuisConseil, setDepuisConseil] = useState(false);
  const [ctx, setCtx] = useState<ContexteClasse | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const chargerRef = useCallback(async () => {
    const r = await chargerReferentiel(sb);
    setRef(r);
    return r;
  }, [sb]);

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
      setCtx(await chargerClasse(sb, classe, periode));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Chargement impossible.");
    } finally {
      setChargement(false);
    }
  }, [sb, classe, periode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement des données de la classe choisie
    recharger();
  }, [recharger]);

  // L'adresse suit l'écran (lien partageable, retour au même endroit après rechargement).
  useEffect(() => {
    const q = new URLSearchParams();
    if (classeId) q.set("classe", classeId);
    if (periodeId) q.set("periode", periodeId);
    if (onglet !== "bulletins") q.set("onglet", onglet);
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
    { v: "bulletins", label: "Bulletins" },
    { v: "conseil", label: "Conseil de classe" },
    { v: "notes", label: "Notes" },
    { v: "absences", label: "Appel & absences" },
    ...(classe && estMaternelle(classe.niveaux) ? [{ v: "maternelle" as Onglet, label: "Relevé maternelle" }] : []),
    ...(directrice ? [{ v: "parametres" as Onglet, label: "Paramètres" }] : []),
  ];

  return (
    <div className="mx-auto max-w-7xl px-5 py-6 md:px-8">
      <PageHeader title="Bulletins" subtitle={annee ? `Année ${annee}` : undefined} />

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
          {/* Barre de choix : classe, période, onglet. */}
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
            <div className="ml-auto flex gap-1">
              {onglets.map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => {
                    setOnglet(o.v);
                    setBulletinId(null);
                    setDepuisConseil(false);
                  }}
                  className={`rounded-md px-3 py-1.5 text-[13px] font-medium ${onglet === o.v ? "bg-accent text-accent-fg" : "text-foreground hover:bg-surface-2"}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {erreur && <p className="mb-3 rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>}

          {onglet === "parametres" && directrice ? (
            <ParametresBulletins
              referentiel={ref}
              annee={annee}
              classeId={classeId}
              onRecharger={async () => {
                await chargerRef();
                await recharger();
              }}
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
            <Absences classe={ctx.classe} periode={ctx.periode} eleves={ctx.eleves} peutSaisir={droits.directrice || droits.titulaire} directrice={droits.directrice} />
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
          ) : onglet === "notes" ? (
            <SaisieNotes ctx={ctx} resultats={resultats} droits={droits} enseignants={enseignants} onMaj={setCtx} />
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
