"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CLASSES } from "@/lib/eleves";
import { libellePeriode, niveauDe, nomEleve, nomEnseignant, type Classe, type EleveBulletin, type Enseignant, type Groupe, type Matiere, type Periode } from "@/lib/bulletins";
import type { Referentiel } from "@/lib/bulletinsDonnees";
import { Modal, Field, inputCls } from "@/components/GestionComptes";

/** Informations d'une nouvelle famille : toutes facultatives (rien ne bloque la création). */
type InfosFamille = {
  nom: string;
  parent1_prenom: string;
  parent1_nom: string;
  parent1_telephone: string;
  parent1_courriel: string;
  parent2_prenom: string;
  parent2_nom: string;
  parent2_telephone: string;
  parent2_courriel: string;
  adresse: string;
  cp_ville: string;
};
/** Famille : id d'une famille existante, ou NOUVELLE (décrite par `infos`). */
type Ajout = { famille: string; prenom: string; nom: string; niveau: string; infos?: InfosFamille };
const NOUVELLE = "__nouvelle";
const infosVides = (nom: string): InfosFamille => ({
  nom,
  parent1_prenom: "",
  parent1_nom: "",
  parent1_telephone: "",
  parent1_courriel: "",
  parent2_prenom: "",
  parent2_nom: "",
  parent2_telephone: "",
  parent2_courriel: "",
  adresse: "",
  cp_ville: "",
});

type Section = "classes" | "matieres" | "enseignants" | "periodes";
const classeChamp = "rounded-md border border-border bg-background px-2 py-1 text-[13px] outline-none focus:border-accent";

/** Paramètres des bulletins (Directrice) : chaque modification est enregistrée aussitôt. */
export default function ParametresBulletins({
  referentiel,
  annee,
  classeId,
  onRecharger,
  ajoutPour = null,
}: {
  referentiel: Referentiel;
  annee: string;
  classeId: string | null;
  /** Classe dont le formulaire « Ajouter un élève » s'ouvre d'emblée (bouton de la barre des Bulletins). */
  ajoutPour?: string | null;
  onRecharger: () => Promise<void>;
}) {
  const sb = useMemo(() => createClient(), []);
  const [section, setSection] = useState<Section>("classes");
  const [message, setMessage] = useState<string | null>(null);
  const [eleves, setEleves] = useState<EleveBulletin[]>([]);
  const [membres, setMembres] = useState<{ classe_id: string; eleve_id: string }[]>([]);
  const [familles, setFamilles] = useState<{ id: string; nom: string }[]>([]);
  const [groupes, setGroupes] = useState<Groupe[]>([]);
  const [matieres, setMatieres] = useState<Matiere[]>([]);
  const [classeMatieres, setClasseMatieres] = useState<string | null>(classeId);
  const classes = referentiel.classes.filter((c) => c.annee_scolaire === annee);
  const enseignants = referentiel.enseignants;

  async function chargerDetails() {
    const ids = referentiel.classes.filter((c) => c.annee_scolaire === annee).map((c) => c.id);
    const [e, ce, g, m, f] = await Promise.all([
      sb.rpc("eleves_bulletins", { p_annee: annee }),
      ids.length ? sb.from("classe_eleves").select("classe_id, eleve_id").in("classe_id", ids) : Promise.resolve({ data: [] }),
      ids.length ? sb.from("matieres_groupes").select("*").in("classe_id", ids).order("ordre") : Promise.resolve({ data: [] }),
      ids.length ? sb.from("matieres").select("*").in("classe_id", ids).order("ordre") : Promise.resolve({ data: [] }),
      sb.from("familles").select("id, nom").order("nom"),
    ]);
    setEleves((e.data ?? []) as EleveBulletin[]);
    setMembres((ce.data ?? []) as { classe_id: string; eleve_id: string }[]);
    setGroupes((g.data ?? []) as Groupe[]);
    setMatieres((m.data ?? []) as Matiere[]);
    setFamilles((f.data ?? []) as { id: string; nom: string }[]);
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement initial des détails
    chargerDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referentiel, annee]);

  async function ecrire(action: PromiseLike<{ error: { message: string } | null }>, recharger: "tout" | "details" = "details") {
    const { error } = await action;
    if (error) {
      setMessage(`Échec : ${error.message}`);
      return false;
    }
    setMessage(null);
    if (recharger === "tout") await onRecharger();
    else await chargerDetails();
    return true;
  }

  const sections: { v: Section; label: string }[] = [
    { v: "classes", label: "Classes et élèves" },
    { v: "matieres", label: "Matières" },
    { v: "enseignants", label: "Enseignants" },
    { v: "periodes", label: "Périodes" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {sections.map((s) => (
          <button
            key={s.v}
            type="button"
            onClick={() => setSection(s.v)}
            className={`rounded-full px-3 py-1 text-[13px] ${section === s.v ? "bg-accent-soft font-medium text-accent" : "hover:bg-surface-2"}`}
          >
            {s.label}
          </button>
        ))}
        {message && <span className="ml-2 self-center text-[12px] text-negative">{message}</span>}
      </div>

      {section === "classes" && (
        <div className="space-y-3">
          {classes.map((c) => (
            <CarteClasse
              key={`${c.id}:${ajoutPour === c.id ? "ajout" : ""}`}
              ajoutDirect={ajoutPour === c.id}
              c={c}
              enseignants={enseignants}
              eleves={eleves}
              membres={membres}
              classes={classes}
              familles={familles}
              onAjouterEleve={async (p) => {
                const { error } = await sb.rpc("eleve_ajouter", {
                  p_famille: p.famille && p.famille !== NOUVELLE ? p.famille : null,
                  p_prenom: p.prenom.trim(),
                  p_nom: p.nom.trim(),
                  p_niveau: p.niveau,
                  p_annee: annee,
                  p_classe: c.id,
                  p_famille_infos: p.famille && p.famille !== NOUVELLE ? null : (p.infos ?? infosVides(p.nom)),
                });
                if (error) return error.message;
                await chargerDetails();
                return null;
              }}
              onModifier={(p) => ecrire(sb.from("classes").update(p).eq("id", c.id), "tout")}
              onNomUsage={(eleveId, nom) => ecrire(sb.rpc("eleve_nom_usage", { p_eleve: eleveId, p_nom: nom }))}
              onEleve={(eleveId, dedans) =>
                ecrire(
                  dedans
                    ? sb.from("classe_eleves").insert({ classe_id: c.id, eleve_id: eleveId })
                    : sb.from("classe_eleves").delete().eq("classe_id", c.id).eq("eleve_id", eleveId),
                )
              }
              onSupprimer={() =>
                window.confirm(`Supprimer la classe « ${c.nom} » ? Ses matières, évaluations et bulletins seront supprimés.`) &&
                ecrire(sb.from("classes").delete().eq("id", c.id), "tout")
              }
            />
          ))}
          <button
            type="button"
            onClick={() => ecrire(sb.from("classes").insert({ annee_scolaire: annee, nom: `Nouvelle classe ${classes.length + 1}`, niveaux: [], ordre: classes.length + 1 }), "tout")}
            className="rounded-lg border border-dashed border-border px-3 py-2 text-[13px] text-accent hover:bg-surface-2"
          >
            + Nouvelle classe ({annee})
          </button>
        </div>
      )}

      {section === "matieres" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {classes.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setClasseMatieres(c.id)}
                className={`rounded-md px-3 py-1 text-[13px] ${c.id === (classeMatieres ?? classes[0]?.id) ? "bg-accent text-accent-fg" : "border border-border hover:bg-surface-2"}`}
              >
                {c.nom}
              </button>
            ))}
          </div>
          {(() => {
            const c = classes.find((x) => x.id === (classeMatieres ?? classes[0]?.id));
            if (!c) return null;
            const gs = groupes.filter((g) => g.classe_id === c.id).sort((a, b) => a.ordre - b.ordre);
            return (
              <div className="space-y-3">
                {gs.map((g, gi) => (
                  <div key={g.id} className="rounded-xl border border-border bg-surface">
                    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-gold-soft/50 px-3 py-2">
                      <input defaultValue={g.nom} onBlur={(e) => e.target.value.trim() !== g.nom && ecrire(sb.from("matieres_groupes").update({ nom: e.target.value.trim() }).eq("id", g.id))} className={`${classeChamp} font-semibold`} aria-label="Nom du groupe" />
                      <label className="text-[12px] text-muted">
                        coef{" "}
                        <input defaultValue={String(g.coef)} onBlur={(e) => Number(e.target.value.replace(",", ".")) !== Number(g.coef) && ecrire(sb.from("matieres_groupes").update({ coef: Number(e.target.value.replace(",", ".")) || 1 }).eq("id", g.id))} className={`${classeChamp} w-12`} />
                      </label>
                      <div className="ml-auto flex gap-1">
                        <Petit disabled={gi === 0} onClick={() => echanger(gs[gi - 1], g, "matieres_groupes")}>↑</Petit>
                        <Petit disabled={gi === gs.length - 1} onClick={() => echanger(g, gs[gi + 1], "matieres_groupes")}>↓</Petit>
                      </div>
                    </div>
                    <table className="w-full text-[13px]">
                      <tbody>
                        {matieres
                          .filter((m) => m.groupe_id === g.id)
                          .sort((a, b) => a.ordre - b.ordre)
                          .map((m, mi, ms) => (
                            <LigneMatiere
                              key={m.id}
                              m={m}
                              niveaux={c.niveaux}
                              enseignants={enseignants}
                              premier={mi === 0}
                              dernier={mi === ms.length - 1}
                              onModifier={(p) => ecrire(sb.from("matieres").update(p).eq("id", m.id))}
                              onMonter={() => echanger(ms[mi - 1], m, "matieres")}
                              onDescendre={() => echanger(m, ms[mi + 1], "matieres")}
                            />
                          ))}
                      </tbody>
                    </table>
                    <div className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() =>
                          ecrire(sb.from("matieres").insert({ classe_id: c.id, groupe_id: g.id, nom: "Nouvelle matière", ordre: matieres.filter((m) => m.groupe_id === g.id).length + 1, enseignants: c.titulaire_id ? [c.titulaire_id] : [] }))
                        }
                        className="text-[12.5px] text-accent hover:underline"
                      >
                        + Matière
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => ecrire(sb.from("matieres_groupes").insert({ classe_id: c.id, nom: "Nouveau groupe", ordre: gs.length + 1 }))}
                  className="rounded-lg border border-dashed border-border px-3 py-2 text-[13px] text-accent hover:bg-surface-2"
                >
                  + Groupe de matières
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {section === "enseignants" && (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-medium">Civilité</th>
                  <th className="px-2 py-2 font-medium">Prénom</th>
                  <th className="px-2 py-2 font-medium">Nom</th>
                  <th className="px-2 py-2 font-medium">Connexion</th>
                  <th className="px-2 py-2 font-medium" title="Nom proposé dans l'onglet Professeurs de l'écran de connexion">Sur l&apos;accueil</th>
                  <th className="px-2 py-2 font-medium">Actif</th>
                </tr>
              </thead>
              <tbody>
                {enseignants.map((e) => (
                  <tr key={e.id} className="border-t border-border/60">
                    {(["civilite", "prenom", "nom"] as const).map((k) => (
                      <td key={k} className="px-2 py-1">
                        <input defaultValue={e[k] ?? ""} onBlur={(ev) => ev.target.value.trim() !== (e[k] ?? "") && ecrire(sb.from("enseignants").update({ [k]: ev.target.value.trim() || (k === "civilite" ? null : e[k]) }).eq("id", e.id), "tout")} className={`${classeChamp} w-full`} />
                      </td>
                    ))}
                    <td className="px-2 py-1 text-[12px] text-muted">
                      {e.identifiant ? `Onglet Professeurs (${e.identifiant})` : e.user_id ? "Compte du bureau" : "Aucun compte — à créer par le Trésorier"}
                    </td>
                    <td className="px-2 py-1">
                      {e.identifiant && (
                        <input
                          type="checkbox"
                          checked={!e.masque_connexion}
                          onChange={(ev) => ecrire(sb.from("enseignants").update({ masque_connexion: !ev.target.checked }).eq("id", e.id), "tout")}
                          aria-label={`Proposer ${e.prenom} sur l'écran de connexion`}
                        />
                      )}
                    </td>
                    <td className="px-2 py-1">
                      <input type="checkbox" checked={e.actif} onChange={(ev) => ecrire(sb.from("enseignants").update({ actif: ev.target.checked }).eq("id", e.id), "tout")} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => ecrire(sb.from("enseignants").insert({ prenom: "Prénom", nom: "Nom" }), "tout")}
            className="rounded-lg border border-dashed border-border px-3 py-2 text-[13px] text-accent hover:bg-surface-2"
          >
            + Enseignant
          </button>
          <p className="text-[12px] text-muted">
            Le compte de connexion d&apos;un nouvel enseignant (onglet « Professeurs » de l&apos;écran d&apos;accueil) est créé par le Trésorier.
          </p>
        </div>
      )}

      {section === "periodes" && (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-medium">N°</th>
                  <th className="px-2 py-2 font-medium">Trimestre</th>
                  <th className="px-2 py-2 font-medium">Début</th>
                  <th className="px-2 py-2 font-medium">Fin</th>
                  <th className="px-2 py-2 font-medium">Libellé (facultatif)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {referentiel.periodes
                  .filter((p) => p.annee_scolaire === annee)
                  .map((p) => (
                    <LignePeriode
                      key={p.id}
                      p={p}
                      onModifier={(x) => ecrire(sb.from("periodes").update(x).eq("id", p.id), "tout")}
                      onSupprimer={() => window.confirm(`Supprimer la période ${p.ordre} et ses bulletins ?`) && ecrire(sb.from("periodes").delete().eq("id", p.id), "tout")}
                    />
                  ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => {
              const ps = referentiel.periodes.filter((p) => p.annee_scolaire === annee);
              const fin = ps.at(-1)?.fin ?? `${annee.slice(0, 4)}-09-01`;
              ecrire(sb.from("periodes").insert({ annee_scolaire: annee, debut: fin, fin, trimestre: ps.at(-1)?.trimestre ?? 1, ordre: ps.length + 1 }), "tout");
            }}
            className="rounded-lg border border-dashed border-border px-3 py-2 text-[13px] text-accent hover:bg-surface-2"
          >
            + Période
          </button>
        </div>
      )}
    </div>
  );

  async function echanger(a: { id: string; ordre: number }, b: { id: string; ordre: number }, table: "matieres" | "matieres_groupes") {
    const oa = a.ordre === b.ordre ? a.ordre + 1 : b.ordre;
    await sb.from(table).update({ ordre: oa }).eq("id", a.id);
    await ecrire(sb.from(table).update({ ordre: a.ordre }).eq("id", b.id));
  }
}

function Petit({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="rounded px-1.5 text-[12px] text-muted hover:bg-surface-2 disabled:opacity-30">
      {children}
    </button>
  );
}

function Puce({ actif, onClick, children, disabled }: { actif: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full px-2 py-0.5 text-[11.5px] ${actif ? "bg-accent text-accent-fg" : "border border-border text-muted hover:bg-surface-2"} disabled:opacity-50`}
    >
      {children}
    </button>
  );
}

function CarteClasse({
  c,
  enseignants,
  eleves,
  membres,
  classes,
  familles,
  onAjouterEleve,
  ajoutDirect = false,
  onModifier,
  onEleve,
  onNomUsage,
  onSupprimer,
}: {
  c: Classe;
  enseignants: Enseignant[];
  eleves: EleveBulletin[];
  membres: { classe_id: string; eleve_id: string }[];
  classes: Classe[];
  familles: { id: string; nom: string }[];
  /** Message d'erreur, ou null si l'élève est ajouté. */
  onAjouterEleve: (p: Ajout) => Promise<string | null>;
  ajoutDirect?: boolean;
  onModifier: (p: Partial<Classe>) => void;
  onEleve: (eleveId: string, dedans: boolean) => void;
  onNomUsage: (eleveId: string, nom: string) => void;
  onSupprimer: () => void;
}) {
  const [elevesOuverts, setElevesOuverts] = useState(ajoutDirect);
  const [ajout, setAjout] = useState<Ajout | null>(ajoutDirect ? { famille: "", prenom: "", nom: "", niveau: c.niveaux[0] ?? "PS" } : null);
  const [erreurAjout, setErreurAjout] = useState<string | null>(null);
  const dedans = new Set(membres.filter((m) => m.classe_id === c.id).map((m) => m.eleve_id));
  const classeDe = (id: string) => classes.find((x) => x.id === membres.find((m) => m.eleve_id === id && m.classe_id !== c.id)?.classe_id)?.nom;
  const scolarises = eleves.filter((e) => niveauDe(e, c.annee_scolaire) !== null);
  return (
    <div id={`classe-${c.id}`} className={`scroll-mt-4 rounded-xl border bg-surface p-3 ${ajoutDirect ? "border-accent" : "border-border"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <input defaultValue={c.nom} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.nom && onModifier({ nom: e.target.value.trim() })} className={`${classeChamp} font-semibold`} aria-label="Nom de la classe" />
        <div className="flex flex-wrap gap-1">
          {CLASSES.map((n) => (
            <Puce key={n} actif={c.niveaux.includes(n)} onClick={() => onModifier({ niveaux: c.niveaux.includes(n) ? c.niveaux.filter((x) => x !== n) : CLASSES.filter((x) => x === n || c.niveaux.includes(x)) })}>
              {n}
            </Puce>
          ))}
        </div>
        <button type="button" onClick={onSupprimer} className="ml-auto text-[12px] text-negative hover:underline">
          Supprimer
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
        <label className="flex items-center gap-1.5">
          Titulaire
          <select value={c.titulaire_id ?? ""} onChange={(e) => onModifier({ titulaire_id: e.target.value || null })} className={classeChamp}>
            <option value="">—</option>
            {enseignants.filter((e) => e.actif).map((e) => (
              <option key={e.id} value={e.id}>
                {nomEnseignant(e)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={c.afficher_rang} onChange={(e) => onModifier({ afficher_rang: e.target.checked })} />
          Rang sur le bulletin
        </label>
        <label className="flex items-center gap-1.5" title="Classe multi-niveaux : rang et moyenne de classe parmi les élèves du même niveau">
          <input type="checkbox" checked={c.rang_par_niveau} onChange={(e) => onModifier({ rang_par_niveau: e.target.checked })} />
          Rang et moyenne par niveau
        </label>
        <button
          type="button"
          onClick={() => {
            setElevesOuverts(true);
            setAjout({ famille: "", prenom: "", nom: "", niveau: c.niveaux[0] ?? "PS" });
          }}
          className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-accent-fg"
        >
          + Ajouter un élève
        </button>
        <button type="button" onClick={() => setElevesOuverts((o) => !o)} className="text-accent hover:underline">
          {dedans.size} élève{dedans.size > 1 ? "s" : ""} · {elevesOuverts ? "masquer" : "modifier"}
        </button>
      </div>
      {elevesOuverts && (
        <div className="mt-2 grid gap-x-4 gap-y-0.5 border-t border-border pt-2 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
          {scolarises.map((e) => (
            <label key={e.id} className="flex items-center gap-2">
              <input type="checkbox" checked={dedans.has(e.id)} onChange={(ev) => onEleve(e.id, ev.target.checked)} />
              <span>{e.prenom}</span>
              <input
                defaultValue={e.nom}
                onBlur={(ev) => ev.target.value.trim() && ev.target.value.trim() !== e.nom && onNomUsage(e.id, ev.target.value.trim())}
                className="w-32 rounded border border-transparent bg-transparent px-1 text-[13px] outline-none hover:border-border focus:border-accent"
                title="Nom tel que l'école l'écrit sur le bulletin"
                aria-label={`Nom de ${e.prenom}`}
              />
              <span className="text-[11px] text-muted">{niveauDe(e, c.annee_scolaire)}</span>
              {!dedans.has(e.id) && classeDe(e.id) && <span className="text-[10.5px] text-gold">({classeDe(e.id)})</span>}
            </label>
          ))}
          <div className="col-span-full mt-1">
            {ajout ? (
              <AjoutEleve
                erreur={erreurAjout}
                ajout={ajout}
                familles={familles}
                niveaux={c.niveaux.length ? c.niveaux : [...CLASSES]}
                onChange={setAjout}
                onAnnuler={() => setAjout(null)}
                onValider={async () => {
                  const err = await onAjouterEleve(ajout);
                  setErreurAjout(err ? `Échec : ${err}` : null);
                  if (!err) setAjout(null);
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setAjout({ famille: "", prenom: "", nom: "", niveau: c.niveaux[0] ?? "PS" })}
                className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-accent-fg"
              >
                + Ajouter un élève
              </button>
            )}
          </div>
        </div>
      )}
      {!elevesOuverts && (
        <p className="mt-1 text-[12px] text-muted">
          {scolarises
            .filter((e) => dedans.has(e.id))
            .map(nomEleve)
            .join(", ") || "Aucun élève."}
        </p>
      )}
    </div>
  );
}

/**
 * Nouvel élève, inscrit dans cette classe au niveau choisi pour l'année. Aucune contrainte sur la famille : une
 * famille existante, ou une nouvelle (fenêtre facultative). Il apparaît dans l'Espace famille et la fiche du Carnet
 * d'adresses de sa famille ; une nouvelle famille est aussi ajoutée aux Frais de scolarité.
 */
function AjoutEleve({
  ajout,
  familles,
  niveaux,
  onChange,
  onAnnuler,
  onValider,
  erreur,
}: {
  erreur?: string | null;
  ajout: Ajout;
  familles: { id: string; nom: string }[];
  niveaux: string[];
  onChange: (a: Ajout) => void;
  onAnnuler: () => void;
  onValider: () => void;
}) {
  const [envoi, setEnvoi] = useState(false);
  const [fenetre, setFenetre] = useState<InfosFamille | null>(null);
  // Seuls le prénom et le niveau sont nécessaires : sans famille choisie, une nouvelle famille est créée.
  const pret = ajout.prenom.trim() && ajout.niveau;
  const nouvelle = ajout.famille === NOUVELLE || !ajout.famille;
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-surface-2/50 p-2 sm:flex sm:flex-wrap sm:items-end">
      <label className="grid gap-0.5 text-[11px] text-muted">
        Famille
        <select
          value={ajout.famille}
          onChange={(e) => {
            if (e.target.value === NOUVELLE) {
              setFenetre(ajout.infos ?? infosVides(ajout.nom));
              return;
            }
            const f = familles.find((x) => x.id === e.target.value);
            // Le nom suit la famille tant qu'il n'a pas été changé à la main.
            const nomSuit = !ajout.nom || familles.some((x) => x.nom === ajout.nom);
            onChange({ ...ajout, famille: e.target.value, infos: undefined, nom: nomSuit ? (f?.nom ?? "") : ajout.nom });
          }}
          className={classeChamp}
        >
          <option value="">Choisir la famille…</option>
          <option value={NOUVELLE}>{ajout.famille === NOUVELLE ? `Nouvelle famille : ${ajout.infos?.nom || ajout.nom || "sans nom"}` : "+ Nouvelle famille…"}</option>
          {familles.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nom}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-0.5 text-[11px] text-muted">
        Prénom
        <input value={ajout.prenom} onChange={(e) => onChange({ ...ajout, prenom: e.target.value })} className={`${classeChamp} w-full py-2 text-[15px] sm:w-32 sm:py-1 sm:text-[13px]`} />
      </label>
      <label className="grid gap-0.5 text-[11px] text-muted" title="Nom tel que l'école l'écrit sur le bulletin (celui de la famille par défaut)">
        Nom
        <input value={ajout.nom} onChange={(e) => onChange({ ...ajout, nom: e.target.value })} className={`${classeChamp} w-full py-2 text-[15px] sm:w-40 sm:py-1 sm:text-[13px]`} />
      </label>
      <label className="grid gap-0.5 text-[11px] text-muted">
        Niveau
        <select value={ajout.niveau} onChange={(e) => onChange({ ...ajout, niveau: e.target.value })} className={classeChamp}>
          {niveaux.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center justify-end gap-3 pb-0.5">
        <button type="button" onClick={onAnnuler} className="text-[13px] text-muted hover:underline">
          Annuler
        </button>
        <button
          type="button"
          disabled={!pret || envoi}
          onClick={async () => {
            setEnvoi(true);
            await onValider();
            setEnvoi(false);
          }}
          className="rounded-lg bg-accent px-5 py-2 text-[14px] font-semibold text-accent-fg disabled:opacity-50 sm:px-3 sm:py-1 sm:text-[12.5px]"
        >
          {envoi ? "Ajout…" : "Ajouter"}
        </button>
      </div>
      {erreur && <p className="w-full rounded-md bg-negative/10 px-2 py-1 text-[12.5px] text-negative">{erreur}</p>}
      {nouvelle && (
        <p className="w-full text-[11px] text-muted">
          {ajout.famille === NOUVELLE ? (
            <button type="button" onClick={() => setFenetre(ajout.infos ?? infosVides(ajout.nom))} className="text-accent hover:underline">
              Compléter les informations de la nouvelle famille
            </button>
          ) : (
            "Sans famille choisie, une nouvelle famille sera créée au nom indiqué."
          )}
        </p>
      )}
      {fenetre && (
        <Modal title="Nouvelle famille" onClose={() => setFenetre(null)}>
          <div className="grid gap-3">
            <p className="text-[12.5px] text-muted">
              Aucune information n&apos;est obligatoire : vous pourrez compléter la fiche plus tard. La famille sera ajoutée aux Frais de scolarité, à l&apos;Espace famille et au Carnet d&apos;adresses.
            </p>
            <Field label="Nom de la famille">
              <input value={fenetre.nom} onChange={(e) => setFenetre({ ...fenetre, nom: e.target.value })} className={inputCls} />
            </Field>
            {([1, 2] as const).map((k) => (
              <div key={k} className="grid gap-2 sm:grid-cols-2">
                <Field label={`Parent ${k} : prénom`}>
                  <input value={fenetre[`parent${k}_prenom`]} onChange={(e) => setFenetre({ ...fenetre, [`parent${k}_prenom`]: e.target.value })} className={inputCls} />
                </Field>
                <Field label={`Parent ${k} : nom`}>
                  <input value={fenetre[`parent${k}_nom`]} onChange={(e) => setFenetre({ ...fenetre, [`parent${k}_nom`]: e.target.value })} className={inputCls} />
                </Field>
                <Field label={`Parent ${k} : téléphone`}>
                  <input value={fenetre[`parent${k}_telephone`]} onChange={(e) => setFenetre({ ...fenetre, [`parent${k}_telephone`]: e.target.value })} className={inputCls} />
                </Field>
                <Field label={`Parent ${k} : courriel`}>
                  <input type="email" value={fenetre[`parent${k}_courriel`]} onChange={(e) => setFenetre({ ...fenetre, [`parent${k}_courriel`]: e.target.value })} className={inputCls} />
                </Field>
              </div>
            ))}
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Adresse">
                <input value={fenetre.adresse} onChange={(e) => setFenetre({ ...fenetre, adresse: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Code postal et ville">
                <input value={fenetre.cp_ville} onChange={(e) => setFenetre({ ...fenetre, cp_ville: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setFenetre(null)} className="rounded-lg border border-border px-4 py-2 text-sm">
                Annuler
              </button>
              <button
                type="button"
                onClick={() => {
                  const nomSuit = !ajout.nom || ajout.nom === ajout.infos?.nom || familles.some((x) => x.nom === ajout.nom);
                  onChange({ ...ajout, famille: NOUVELLE, infos: fenetre, nom: nomSuit ? fenetre.nom.trim() : ajout.nom });
                  setFenetre(null);
                }}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
              >
                Valider
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function LigneMatiere({
  m,
  niveaux,
  enseignants,
  premier,
  dernier,
  onModifier,
  onMonter,
  onDescendre,
}: {
  m: Matiere;
  niveaux: string[];
  enseignants: Enseignant[];
  premier: boolean;
  dernier: boolean;
  onModifier: (p: Partial<Matiere>) => void;
  onMonter: () => void;
  onDescendre: () => void;
}) {
  return (
    <tr className={`border-t border-border/60 ${m.actif ? "" : "opacity-50"}`}>
      <td className="px-3 py-1.5">
        <input defaultValue={m.nom} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== m.nom && onModifier({ nom: e.target.value.trim() })} className={`${classeChamp} w-40`} aria-label="Matière" />
      </td>
      <td className="px-2 py-1.5 text-[12px] text-muted">
        coef <input defaultValue={String(m.coef)} onBlur={(e) => Number(e.target.value.replace(",", ".")) !== Number(m.coef) && onModifier({ coef: Number(e.target.value.replace(",", ".")) || 1 })} className={`${classeChamp} w-12`} />
      </td>
      <td className="px-2 py-1.5">
        {niveaux.length > 1 && (
          <div className="flex flex-wrap gap-1" title="Niveaux concernés (aucun coché = tous)">
            {niveaux.map((n) => (
              <Puce key={n} actif={m.niveaux.includes(n)} onClick={() => onModifier({ niveaux: m.niveaux.includes(n) ? m.niveaux.filter((x) => x !== n) : [...m.niveaux, n] })}>
                {n}
              </Puce>
            ))}
            {m.niveaux.length === 0 && <span className="text-[11px] text-muted">tous niveaux</span>}
          </div>
        )}
      </td>
      <td className="px-2 py-1.5">
        <div className="flex flex-wrap gap-1">
          {enseignants
            .filter((e) => e.actif || m.enseignants.includes(e.id))
            .map((e) => (
              <Puce key={e.id} actif={m.enseignants.includes(e.id)} onClick={() => onModifier({ enseignants: m.enseignants.includes(e.id) ? m.enseignants.filter((x) => x !== e.id) : [...m.enseignants, e.id] })}>
                {e.prenom}
              </Puce>
            ))}
        </div>
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right">
        <Petit disabled={premier} onClick={onMonter}>↑</Petit>
        <Petit disabled={dernier} onClick={onDescendre}>↓</Petit>
        <button type="button" onClick={() => onModifier({ actif: !m.actif })} className="ml-1 text-[12px] text-muted hover:underline">
          {m.actif ? "Retirer" : "Rétablir"}
        </button>
      </td>
    </tr>
  );
}

function LignePeriode({ p, onModifier, onSupprimer }: { p: Periode; onModifier: (x: Partial<Periode>) => void; onSupprimer: () => void }) {
  return (
    <tr className="border-t border-border/60">
      <td className="px-3 py-1 tabular-nums">{p.ordre}</td>
      <td className="px-2 py-1">
        <select value={p.trimestre ?? ""} onChange={(e) => onModifier({ trimestre: e.target.value ? Number(e.target.value) : null })} className={classeChamp}>
          <option value="1">1er</option>
          <option value="2">2e</option>
          <option value="3">3e</option>
        </select>
      </td>
      <td className="px-2 py-1">
        <input type="date" defaultValue={p.debut} onBlur={(e) => e.target.value && e.target.value !== p.debut && onModifier({ debut: e.target.value })} className={classeChamp} />
      </td>
      <td className="px-2 py-1">
        <input type="date" defaultValue={p.fin} onBlur={(e) => e.target.value && e.target.value !== p.fin && onModifier({ fin: e.target.value })} className={classeChamp} />
      </td>
      <td className="px-2 py-1">
        <input defaultValue={p.libelle ?? ""} placeholder={libellePeriode({ ...p, libelle: null })} onBlur={(e) => e.target.value.trim() !== (p.libelle ?? "") && onModifier({ libelle: e.target.value.trim() || null })} className={`${classeChamp} w-56`} />
      </td>
      <td className="px-2 py-1 text-right">
        <button type="button" onClick={onSupprimer} className="text-[12px] text-negative hover:underline">
          Supprimer
        </button>
      </td>
    </tr>
  );
}
