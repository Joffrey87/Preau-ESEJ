"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { anneeInscriptions, enfantsAReinscrire } from "@/lib/inscriptions";
import type { Eleve } from "@/lib/eleves";
import {
  chargerFormulaire,
  FORMULAIRE_DEFAUT,
  LIBELLES_POUR,
  nouvelleCle,
  TITRES_FORMULAIRE,
  toutesLesCles,
  TYPES_CHAMP,
  type Champ,
  type ConfigFormulaire,
  type Pour,
  type Section,
  type TypeChamp,
  type TypeFormulaire,
} from "@/lib/formulaireInscription";
import Preinscription from "./Preinscription";
import Reinscription from "./Reinscription";
import EnTetePreinscription from "./EnTetePreinscription";

const saisie = "w-full rounded-md border border-border bg-background px-2 py-1 text-[13px] outline-none focus:border-accent";
const petitBouton = "rounded-md border border-border px-2 py-0.5 text-[12px] hover:bg-surface-2 disabled:opacity-30";

type FamilleApercu = {
  id: string;
  nom: string;
  adresse: string | null;
  cp_ville: string | null;
} & Record<`parent${1 | 2}_${"prenom" | "nom" | "telephone" | "courriel"}`, string | null>;

/**
 * Formulaires de préinscription et de réinscription : la Directrice modifie textes, sections et champs (base commune,
 * chaque élément pouvant ne concerner qu'un des deux), voit à droite le formulaire tel que la famille le verra, enregistre
 * un brouillon puis publie. Les champs « socle » (nom de l'enfant, contact du parent 1) restent : la base les exige.
 */
export default function EditeurFormulaires() {
  const sb = useMemo(() => createClient(), []);
  const annee = anneeInscriptions();
  const [config, setConfig] = useState<ConfigFormulaire | null>(null);
  const [enregistre, setEnregistre] = useState("");
  const [publie, setPublie] = useState("");
  const [publieLe, setPublieLe] = useState<string | null>(null);
  const [vue, setVue] = useState<TypeFormulaire>("pre");
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [familles, setFamilles] = useState<FamilleApercu[]>([]);
  const [familleId, setFamilleId] = useState<string>("");
  const [eleves, setEleves] = useState<Eleve[]>([]);

  const charger = useCallback(async () => {
    const [b, p] = await Promise.all([chargerFormulaire(sb, "brouillon"), chargerFormulaire(sb, "publie")]);
    setConfig(b.config);
    setEnregistre(JSON.stringify(b.config));
    setPublie(JSON.stringify(p.config));
    setPublieLe(p.publieLe);
  }, [sb]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement du formulaire
    charger();
    sb.from("familles")
      .select("id, nom, adresse, cp_ville, parent1_prenom, parent1_nom, parent1_telephone, parent1_courriel, parent2_prenom, parent2_nom, parent2_telephone, parent2_courriel")
      .order("nom")
      .then(({ data }) => {
        const l = (data ?? []) as FamilleApercu[];
        setFamilles(l);
        setFamilleId((id) => id || l[0]?.id || "");
      });
  }, [charger, sb]);

  useEffect(() => {
    if (!familleId) return;
    sb.from("eleves")
      .select("id, prenom, initiale, classe_entree, annee_entree, decalage, sorti_le")
      .eq("famille_id", familleId)
      .then(({ data }) => setEleves((data ?? []) as Eleve[]));
  }, [sb, familleId]);

  const famille = familles.find((f) => f.id === familleId);
  const enfants = useMemo(() => (famille ? enfantsAReinscrire(famille, eleves, annee) : []), [famille, eleves, annee]);

  if (!config) return <p className="text-sm text-muted">Chargement…</p>;

  const json = JSON.stringify(config);
  const nonEnregistre = json !== enregistre;
  const nonPublie = json !== publie;

  // ——— Modifications ———
  const majSections = (f: (s: Section[]) => Section[]) => setConfig({ ...config, sections: f(config.sections) });
  const majSection = (i: number, p: Partial<Section>) => majSections((ss) => ss.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const majChamp = (i: number, k: number, p: Partial<Champ>) =>
    majSections((ss) => ss.map((s, j) => (j === i ? { ...s, champs: s.champs.map((c, l) => (l === k ? { ...c, ...p } : c)) } : s)));
  const deplacer = <T,>(l: T[], de: number, vers: number) => {
    if (vers < 0 || vers >= l.length) return l;
    const r = [...l];
    const [x] = r.splice(de, 1);
    r.splice(vers, 0, x);
    return r;
  };
  const ajouterChamp = (i: number) => {
    const cle = nouvelleCle("nouveau champ", toutesLesCles(config));
    majSections((ss) => ss.map((s, j) => (j === i ? { ...s, champs: [...s.champs, { cle, libelle: "Nouveau champ", type: "texte", obligatoire: false, pour: "tous" }] } : s)));
    setOuvert(cle);
  };
  const ajouterSection = () => {
    const id = nouvelleCle("section", new Set(config.sections.map((s) => s.id)));
    majSections((ss) => [...ss, { id, titre: "Nouvelle section", pour: "tous", champs: [] }]);
  };
  const changerSection = (i: number, k: number, vers: number) =>
    majSections((ss) => {
      const ch = ss[i].champs[k];
      return ss.map((s, j) => (j === i ? { ...s, champs: s.champs.filter((_, l) => l !== k) } : j === vers ? { ...s, champs: [...s.champs, ch] } : s));
    });
  const photoPresente = config.sections.some((s) => s.champs.some((c) => c.type === "photo"));

  // ——— Enregistrement ———
  async function enregistrer() {
    const { error } = await sb.rpc("inscription_formulaire_enregistrer", { p_config: config });
    if (error) throw new Error(error.message);
    setEnregistre(json);
  }
  async function action(f: () => Promise<void>, ok: string) {
    setOccupe(true);
    setMessage(null);
    try {
      await f();
      setMessage({ ok: true, texte: ok });
    } catch (e) {
      setMessage({ ok: false, texte: `Échec : ${e instanceof Error ? e.message : e}` });
    } finally {
      setOccupe(false);
    }
  }
  const publier = () =>
    action(async () => {
      if (!window.confirm("Publier ces formulaires ? Les familles verront aussitôt la nouvelle version (les dossiers déjà reçus gardent leurs réponses).")) throw new Error("publication annulée");
      if (nonEnregistre) await enregistrer();
      const { error } = await sb.rpc("inscription_formulaire_publier");
      if (error) throw new Error(error.message);
      await charger();
    }, "Formulaires publiés : les familles voient la nouvelle version.");
  const revenir = () => {
    if (!window.confirm("Abandonner les modifications non publiées et revenir à la version publiée ?")) return;
    setConfig(JSON.parse(publie));
  };
  const textes = config.textes[vue];

  return (
    <div className="space-y-3">
      {/* Barre d'état et d'actions. */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2 text-[13px]">
        <span className={`rounded-full px-2 py-0.5 text-[11.5px] ${nonPublie ? "bg-gold-soft text-gold" : "bg-positive/15 text-positive"}`}>
          {nonPublie ? (nonEnregistre ? "Modifications non enregistrées" : "Brouillon enregistré, non publié") : "À jour : version publiée"}
        </span>
        {publieLe && <span className="text-[12px] text-muted">Publié le {new Date(publieLe).toLocaleDateString("fr-FR")}</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          {nonPublie && (
            <button type="button" onClick={revenir} disabled={occupe} className="rounded-lg px-3 py-1.5 text-muted hover:bg-surface-2">
              Revenir à la version publiée
            </button>
          )}
          <button type="button" onClick={() => action(enregistrer, "Brouillon enregistré.")} disabled={occupe || !nonEnregistre} className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-2 disabled:opacity-40">
            Enregistrer le brouillon
          </button>
          <button type="button" onClick={publier} disabled={occupe || !nonPublie} className="rounded-lg bg-accent px-3 py-1.5 font-medium text-accent-fg disabled:opacity-40">
            Publier
          </button>
        </div>
        {message && <p className={`w-full text-[12.5px] ${message.ok ? "text-positive" : "text-negative"}`}>{message.texte}</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* ——— Éditeur ——— */}
        <div className="space-y-3">
          <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
            <div className="text-[13px] font-semibold">Textes · {TITRES_FORMULAIRE[vue]}</div>
            <label className="grid gap-1 text-[12px] text-muted">
              Texte d&apos;accueil
              <textarea value={textes.intro} rows={3} className={saisie} onChange={(e) => setConfig({ ...config, textes: { ...config.textes, [vue]: { ...textes, intro: e.target.value } } })} />
            </label>
            <label className="grid gap-1 text-[12px] text-muted">
              Message après l&apos;envoi
              <textarea value={textes.merci} rows={2} className={saisie} onChange={(e) => setConfig({ ...config, textes: { ...config.textes, [vue]: { ...textes, merci: e.target.value } } })} />
            </label>
            <p className="text-[11.5px] text-muted">Les textes changent selon le formulaire choisi dans l&apos;aperçu ; sections et champs sont communs.</p>
          </div>

          {config.sections.map((s, i) => {
            const aSocle = s.champs.some((c) => c.socle);
            return (
              <div key={s.id} className={`space-y-2 rounded-xl border border-border bg-surface p-3 ${s.pour !== "tous" && s.pour !== vue ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <input value={s.titre} onChange={(e) => majSection(i, { titre: e.target.value })} className={`${saisie} max-w-[16rem] font-semibold`} aria-label="Titre de la section" />
                  <select value={s.pour} disabled={aSocle} onChange={(e) => majSection(i, { pour: e.target.value as Pour })} className={`${saisie} w-auto`} aria-label="Formulaire concerné">
                    {Object.entries(LIBELLES_POUR).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <div className="ml-auto flex gap-1">
                    <button type="button" className={petitBouton} disabled={i === 0} onClick={() => majSections((ss) => deplacer(ss, i, i - 1))} title="Monter la section">↑</button>
                    <button type="button" className={petitBouton} disabled={i === config.sections.length - 1} onClick={() => majSections((ss) => deplacer(ss, i, i + 1))} title="Descendre la section">↓</button>
                    <button
                      type="button"
                      className={`${petitBouton} text-negative`}
                      disabled={aSocle}
                      title={aSocle ? "Cette section contient des champs indispensables" : "Supprimer la section"}
                      onClick={() => window.confirm(`Supprimer la section « ${s.titre} » et ses champs ?`) && majSections((ss) => ss.filter((_, j) => j !== i))}
                    >
                      Supprimer
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-border rounded-lg border border-border">
                  {s.champs.map((c, k) => (
                    <div key={c.cle} className={`p-2 ${c.pour !== "tous" && c.pour !== vue ? "opacity-60" : ""}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <input value={c.libelle} onChange={(e) => majChamp(i, k, { libelle: e.target.value })} className={`${saisie} min-w-[10rem] flex-1`} aria-label="Libellé" />
                        <select value={c.type} disabled={c.socle} onChange={(e) => majChamp(i, k, { type: e.target.value as TypeChamp })} className={`${saisie} w-auto`} aria-label="Type">
                          {TYPES_CHAMP.filter((t) => t.v !== "photo" || c.type === "photo" || !photoPresente).map((t) => (
                            <option key={t.v} value={t.v}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-1 text-[12px]">
                          <input type="checkbox" checked={c.obligatoire} disabled={c.socle} onChange={(e) => majChamp(i, k, { obligatoire: e.target.checked })} />
                          Obligatoire
                        </label>
                        <div className="ml-auto flex gap-1">
                          <button type="button" className={petitBouton} disabled={k === 0} onClick={() => majSection(i, { champs: deplacer(s.champs, k, k - 1) })} title="Monter">↑</button>
                          <button type="button" className={petitBouton} disabled={k === s.champs.length - 1} onClick={() => majSection(i, { champs: deplacer(s.champs, k, k + 1) })} title="Descendre">↓</button>
                          <button type="button" className={petitBouton} onClick={() => setOuvert(ouvert === c.cle ? null : c.cle)} title="Plus de réglages">
                            {ouvert === c.cle ? "▴" : "…"}
                          </button>
                          <button
                            type="button"
                            className={`${petitBouton} text-negative`}
                            disabled={c.socle}
                            title={c.socle ? "Champ indispensable" : "Supprimer le champ"}
                            onClick={() => majSection(i, { champs: s.champs.filter((_, l) => l !== k) })}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      {c.socle && <p className="mt-1 text-[11px] text-muted">Champ indispensable : le libellé et la place se modifient, pas le reste.</p>}
                      {ouvert === c.cle && (
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <label className="grid gap-1 text-[12px] text-muted">
                            Formulaire concerné
                            <select value={c.pour} disabled={c.socle} onChange={(e) => majChamp(i, k, { pour: e.target.value as Pour })} className={saisie}>
                              {Object.entries(LIBELLES_POUR).map(([v, l]) => (
                                <option key={v} value={v}>
                                  {l}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="grid gap-1 text-[12px] text-muted">
                            Section
                            <select value={i} onChange={(e) => changerSection(i, k, Number(e.target.value))} className={saisie}>
                              {config.sections.map((x, j) => (
                                <option key={x.id} value={j}>
                                  {x.titre}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="grid gap-1 text-[12px] text-muted sm:col-span-2">
                            Aide sous le champ (facultatif)
                            <input value={c.aide ?? ""} onChange={(e) => majChamp(i, k, { aide: e.target.value || undefined })} className={saisie} />
                          </label>
                          {c.type === "choix" && (
                            <label className="grid gap-1 text-[12px] text-muted sm:col-span-2">
                              Choix proposés (un par ligne)
                              <textarea
                                value={(c.options ?? []).join("\n")}
                                rows={4}
                                onChange={(e) => majChamp(i, k, { options: e.target.value.split("\n") })}
                                onBlur={(e) => majChamp(i, k, { options: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })}
                                className={saisie}
                              />
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {!s.champs.length && <p className="p-2 text-[12px] text-muted">Aucun champ.</p>}
                </div>
                <button type="button" onClick={() => ajouterChamp(i)} className="text-[12.5px] font-medium text-accent hover:underline">
                  + Ajouter un champ
                </button>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={ajouterSection} className="rounded-lg border border-border px-3 py-1.5 text-[13px] hover:bg-surface-2">
              + Ajouter une section
            </button>
            <button
              type="button"
              onClick={() => window.confirm("Remettre le formulaire d'origine (dans le brouillon) ?") && setConfig(FORMULAIRE_DEFAUT)}
              className="ml-auto text-[12px] text-muted hover:underline"
            >
              Remettre le formulaire d&apos;origine
            </button>
          </div>
        </div>

        {/* ——— Aperçu « comme une famille » ——— */}
        <div className="space-y-2 lg:sticky lg:top-14 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-lg bg-surface-2 p-1">
              {(["pre", "re"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setVue(t)} className={`rounded-md px-3 py-1 text-[13px] font-medium ${vue === t ? "bg-surface text-accent shadow-sm" : "text-muted"}`}>
                  {TITRES_FORMULAIRE[t]}
                </button>
              ))}
            </div>
            {vue === "re" && (
              <select value={familleId} onChange={(e) => setFamilleId(e.target.value)} className={`${saisie} w-auto`} aria-label="Famille de l'aperçu">
                {familles.map((f) => (
                  <option key={f.id} value={f.id}>
                    Famille {f.nom}
                  </option>
                ))}
              </select>
            )}
            <span className="text-[11.5px] text-muted">Aperçu du brouillon, tel que la famille le verra</span>
          </div>
          <div className="rounded-2xl border-2 border-dashed border-border bg-background p-4">
            {vue === "pre" ? (
              <>
                <EnTetePreinscription annee={annee} />
                <Preinscription annee={annee} config={config} apercu />
              </>
            ) : (
              <>
                <h1 className="mb-3 text-center text-lg font-semibold">Réinscription · Année {annee}</h1>
                <Reinscription key={familleId} annee={annee} familleId={familleId} enfants={enfants} apercu config={config} messageApercu="Aperçu : choisissez un enfant pour voir son dossier pré-rempli ; rien n'est envoyé." />
              </>
            )}
            <div className="mt-4 border-t border-dashed border-border pt-3 text-[12px] text-muted">
              Après l&apos;envoi, la famille lit : <span className="whitespace-pre-line text-foreground">{textes.merci}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
