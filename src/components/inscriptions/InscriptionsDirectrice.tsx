"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { anneeInscriptions, STATUTS_DOSSIER, type Dossier, type StatutDossier } from "@/lib/inscriptions";
import { chargerFormulaire, FORMULAIRE_DEFAUT, sectionsPour, type Champ, type ConfigFormulaire } from "@/lib/formulaireInscription";
import EditeurFormulaires from "./EditeurFormulaires";
import FormulaireInscription, { type Reponses } from "./FormulaireInscription";

/**
 * Tableau de bord de la Directrice : dossiers de préinscription (lien public) et de réinscription (Espace famille).
 * Valider, mettre en attente ou refuser ; valider ne crée encore ni élève ni famille. Envoi des liens : courriel
 * (logiciel de messagerie, destinataires en copie cachée) ou lien à copier, l'onglet Communication n'envoyant pas encore.
 */
export default function InscriptionsDirectrice() {
  const [vue, setVue] = useState<"dossiers" | "formulaires">("dossiers");
  return (
    <div className="space-y-4">
      <div className="flex w-fit gap-1 rounded-lg bg-surface-2 p-1">
        {(
          [
            ["dossiers", "Dossiers reçus"],
            ["formulaires", "Formulaires (préinscription, réinscription)"],
          ] as const
        ).map(([v, l]) => (
          <button key={v} type="button" onClick={() => setVue(v)} className={`rounded-md px-3 py-1 text-[13px] font-medium ${vue === v ? "bg-surface text-accent shadow-sm" : "text-muted hover:text-foreground"}`}>
            {l}
          </button>
        ))}
      </div>
      {vue === "dossiers" ? <Dossiers /> : <EditeurFormulaires />}
    </div>
  );
}

/** Réponse lisible d'un champ (date à la française, case cochée, pièce jointe à ouvrir). */
function Reponse({ champ, valeur, ouvrirFichier }: { champ: Champ; valeur: string; ouvrirFichier: (chemin: string) => void }) {
  if (champ.type === "date") return <>{valeur.split("-").reverse().join("/")}</>;
  if (champ.type === "case") return <>{valeur === "oui" ? "Oui" : "Non"}</>;
  if (champ.type === "fichier")
    return (
      <button type="button" onClick={() => ouvrirFichier(valeur)} className="text-accent hover:underline">
        Ouvrir la pièce jointe
      </button>
    );
  return <span className="whitespace-pre-line">{valeur}</span>;
}

function Dossiers() {
  const sb = useMemo(() => createClient(), []);
  const annee = anneeInscriptions();
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [filtre, setFiltre] = useState<StatutDossier | "tous">("tous");
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [courriels, setCourriels] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [copie, setCopie] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigFormulaire>(FORMULAIRE_DEFAUT);
  const [corrige, setCorrige] = useState<string | null>(null);
  const origine = typeof window !== "undefined" ? window.location.origin : "";
  const lienPre = `${origine}/preinscription`;
  const lienRe = `${origine}/espace/inscription`;

  const charger = useCallback(async () => {
    const [d, c] = await Promise.all([
      sb.from("inscriptions_dossiers").select("*").order("created_at", { ascending: false }),
      sb.rpc("inscription_courriels_familles", { p_annee: annee }),
    ]);
    if (d.error) setMessage(`Échec : ${d.error.message}`);
    setDossiers((d.data ?? []) as Dossier[]);
    setCourriels([...new Set(((c.data ?? []) as { courriel: string }[]).map((x) => x.courriel))]);
    setConfig((await chargerFormulaire(sb, "publie")).config);
  }, [sb, annee]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement des dossiers
    charger();
  }, [charger]);

  async function ouvrir(d: Dossier) {
    setOuvert(ouvert === d.id ? null : d.id);
    setPhoto(null);
    if (d.photo_path && ouvert !== d.id) {
      const { data } = await sb.storage.from("inscriptions").createSignedUrl(d.photo_path, 3600);
      setPhoto(data?.signedUrl ?? null);
    }
  }
  async function ouvrirFichier(chemin: string) {
    const { data, error } = await sb.storage.from("inscriptions").createSignedUrl(chemin, 3600);
    if (error || !data) return setMessage(`Échec : ${error?.message ?? "fichier introuvable"}`);
    window.open(data.signedUrl, "_blank", "noopener");
  }
  async function decider(d: Dossier, statut: StatutDossier, note?: string) {
    const { error } = await sb.rpc("inscription_decider", { p_id: d.id, p_statut: statut, p_note: note ?? null });
    setMessage(error ? `Échec : ${error.message}` : null);
    if (!error) await charger();
  }
  const copier = async (t: string) => {
    await navigator.clipboard.writeText(t).catch(() => null);
    setCopie(t);
    setTimeout(() => setCopie(null), 2000);
  };
  const mailto = (sujet: string, corps: string, bcc: string[] = []) =>
    `mailto:?${bcc.length ? `bcc=${encodeURIComponent(bcc.join(","))}&` : ""}subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;

  const liste = dossiers.filter((d) => filtre === "tous" || d.statut === filtre);
  const n = (s: StatutDossier) => dossiers.filter((d) => d.statut === s).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {[
          { titre: "Réinscription (familles de l'école)", lien: lienRe, sujet: `Réinscription ${annee}`, corps: `Bonjour,\n\nLa réinscription pour l'année ${annee} est ouverte. Connectez-vous à votre Espace famille pour vérifier les informations de chaque enfant et envoyer son dossier :\n${lienRe}\n\nBien cordialement,\nLa Directrice`, bcc: courriels },
          { titre: "Préinscription (nouvelles familles)", lien: lienPre, sujet: `Préinscription ${annee} · École du Saint-Enfant-Jésus`, corps: `Bonjour,\n\nPour demander l'inscription de votre enfant pour l'année ${annee}, merci de remplir ce dossier en ligne :\n${lienPre}\n\nBien cordialement,\nLa Directrice`, bcc: [] },
        ].map((x) => (
          <div key={x.titre} className="rounded-xl border border-border bg-surface p-3 text-[13px]">
            <div className="font-semibold">{x.titre}</div>
            <div className="mt-1 break-all text-[12px] text-muted">{x.lien}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => copier(x.lien)} className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-2">
                {copie === x.lien ? "Lien copié ✓" : "Copier le lien"}
              </button>
              <a href={mailto(x.sujet, x.corps, x.bcc)} className="rounded-lg bg-accent px-3 py-1.5 font-medium text-accent-fg">
                Préparer le courriel{x.bcc.length ? ` (${x.bcc.length} adresses en copie cachée)` : ""}
              </a>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-muted">
        Le courriel s&apos;ouvre dans votre logiciel de messagerie. L&apos;envoi depuis l&apos;onglet Communication (courriel et messagerie interne) sera branché dès que ce module sera en ligne.
      </p>

      <div className="flex flex-wrap items-center gap-1">
        {(["tous", ...STATUTS_DOSSIER.map((s) => s.v)] as const).map((v) => (
          <button key={v} type="button" onClick={() => setFiltre(v)} className={`rounded-full px-3 py-1 text-[13px] ${filtre === v ? "bg-accent-soft font-medium text-accent" : "hover:bg-surface-2"}`}>
            {v === "tous" ? `Tous (${dossiers.length})` : `${STATUTS_DOSSIER.find((s) => s.v === v)?.label} (${n(v)})`}
          </button>
        ))}
      </div>
      {message && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{message}</p>}
      {!liste.length && <p className="text-sm text-muted">Aucun dossier.</p>}

      <div className="space-y-2">
        {liste.map((d) => {
          const x = d.donnees;
          const st = STATUTS_DOSSIER.find((s) => s.v === d.statut);
          const contact = [x.parent1_courriel, x.parent2_courriel].filter(Boolean) as string[];
          return (
            <div key={d.id} className="rounded-xl border border-border bg-surface p-3 text-[13px]">
              <button type="button" onClick={() => ouvrir(d)} className="flex w-full flex-wrap items-center gap-2 text-left">
                <span className="font-semibold">{x.enfant_prenom} {x.enfant_nom}</span>
                <span className="text-[12px] text-muted">{x.classe_demandee || "classe ?"} · {d.type === "preinscription" ? "Préinscription" : "Réinscription"} · {d.annee_scolaire}</span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] ${st?.classe}`}>{st?.label}</span>
              </button>
              {ouvert === d.id && (
                <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-[6rem_1fr]">
                  <div>
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- adresse signée temporaire du stockage privé
                      <img src={photo} alt="" className="h-28 w-24 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-28 w-24 items-center justify-center rounded-lg bg-surface-2 text-[11px] text-muted">Sans photo</div>
                    )}
                  </div>
                  <div className="space-y-1">
                    {(() => {
                      const sections = sectionsPour(config, d.type === "preinscription" ? "pre" : "re");
                      const connues = new Set(sections.flatMap((s) => s.champs.map((ch) => ch.cle)));
                      const autres = Object.entries(x).filter(([k, v]) => !connues.has(k) && v);
                      return (
                        <>
                          {sections.map((s) => {
                            const lignes = s.champs.filter((ch) => ch.type !== "photo" && x[ch.cle]);
                            return lignes.length ? (
                              <div key={s.id} className="pb-1">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{s.titre}</div>
                                {lignes.map((ch) => (
                                  <div key={ch.cle}>
                                    <span className="text-muted">{ch.libelle} : </span>
                                    <Reponse champ={ch} valeur={String(x[ch.cle])} ouvrirFichier={ouvrirFichier} />
                                  </div>
                                ))}
                              </div>
                            ) : null;
                          })}
                          {autres.length > 0 && (
                            <div className="pb-1">
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Autres réponses (champs retirés du formulaire)</div>
                              {autres.map(([k, v]) => (
                                <div key={k}>
                                  <span className="text-muted">{k} : </span>
                                  {String(v)}
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      );
                    })()}
                    <div className="text-[11.5px] text-muted">Reçu le {new Date(d.created_at).toLocaleDateString("fr-FR")}{d.traite_le ? ` · traité le ${new Date(d.traite_le).toLocaleDateString("fr-FR")}` : ""}</div>
                    <textarea
                      key={d.note_directrice ?? ""}
                      defaultValue={d.note_directrice ?? ""}
                      placeholder="Note interne (non visible de la famille)"
                      rows={2}
                      onBlur={(e) => e.target.value !== (d.note_directrice ?? "") && decider(d, d.statut, e.target.value)}
                      className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-[13px]"
                    />
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button type="button" onClick={() => decider(d, "valide")} className="rounded-lg bg-positive px-3 py-1.5 font-medium text-white">Valider</button>
                      <button type="button" onClick={() => decider(d, "attente")} className="rounded-lg border border-gold px-3 py-1.5 text-gold">Mettre en attente</button>
                      <button type="button" onClick={() => decider(d, "refuse")} className="rounded-lg border border-negative px-3 py-1.5 text-negative">Refuser</button>
                      <button type="button" onClick={() => setCorrige(corrige === d.id ? null : d.id)} className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-2">
                        {corrige === d.id ? "Fermer la correction" : "Modifier les réponses"}
                      </button>
                      {d.statut !== "recu" && <button type="button" onClick={() => decider(d, "recu")} className="text-[12px] text-muted hover:underline">Remettre à « Reçu »</button>}
                      {contact.length > 0 && (
                        <a href={mailto(`Inscription de ${x.enfant_prenom ?? ""} · ${d.annee_scolaire}`, "Bonjour,\n\n", contact)} className="ml-auto text-[12.5px] text-accent hover:underline">
                          Écrire à la famille
                        </a>
                      )}
                    </div>
                    {corrige === d.id && (
                      <div className="mt-3 rounded-xl border border-accent/40 bg-background p-3">
                        <p className="mb-3 text-[12.5px] text-muted">Correction du dossier : les champs obligatoires ne bloquent pas ; une nouvelle photo ou pièce jointe remplace l&apos;ancienne.</p>
                        <FormulaireInscription
                          config={config}
                          type={d.type === "preinscription" ? "pre" : "re"}
                          initial={Object.fromEntries(Object.entries(x).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])) as Reponses}
                          dossierFichiers="directrice"
                          correction
                          photoActuelle={!!d.photo_path}
                          libelleBouton="Enregistrer les corrections"
                          envoyer={async (donnees, photo) => {
                            const { error } = await sb.rpc("inscription_dossier_modifier", { p_id: d.id, p_donnees: donnees, p_photo: photo });
                            if (error) return error.message;
                            setCorrige(null);
                            setOuvert(null);
                            await charger();
                            return null;
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
