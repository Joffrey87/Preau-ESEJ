"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Icon from "@/components/Icon";
import {
  EVT_SIGNAL,
  chargerAnnuaire,
  chargerBoites,
  chargerClasses,
  chargerFils,
  chargerMessages,
  chargerParticipants,
  deposer,
  lienPj,
  quand,
  refusFichier,
  signalerMaj,
  tailleLisible,
  TYPES_ACCEPTES,
  type Boite,
  type Destinataire,
  type Fil,
  type MessageCom,
  type Participant,
  type PieceJointe,
} from "@/lib/communication";

type Vue = { t: "fil"; id: string } | { t: "nouveau" } | { t: "groupe" } | null;

/** Lance un chargement hors du rendu de l'effet (au tick suivant) ; renvoie de quoi l'annuler. */
const differe = (f: () => void) => {
  const t = window.setTimeout(f, 0);
  return () => window.clearTimeout(t);
};

const champ = "w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-accent";
const bouton = "rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-fg hover:opacity-90 disabled:opacity-50";
const boutonDoux = "rounded-lg border border-border bg-surface px-3 py-1.5 text-[13px] text-accent hover:bg-accent-soft disabled:opacity-50";

/**
 * Messagerie : à gauche les fils de la boîte (service de l'école ou famille), à droite le fil ouvert, un nouveau
 * message ou un envoi groupé. `cote` : « ecole » (services : Direction, Secrétariat, Trésorerie, Événementiel) ou
 * « famille » (Espace famille). Un fil à plus de deux participants est un groupe (membres ajoutés, renommage, départ).
 * Mise à jour en direct : la pastille du menu, abonnée au temps réel, relaie les signaux (EVT_SIGNAL).
 */
export default function Messagerie({ cote }: { cote: "ecole" | "famille" }) {
  const sb = useMemo(() => createClient(), []);
  const [boites, setBoites] = useState<Boite[] | null>(null);
  const [boiteId, setBoiteId] = useState<string | null>(null);
  const [fils, setFils] = useState<Fil[]>([]);
  const [vue, setVue] = useState<Vue>(null);
  const [signal, setSignal] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const boite = boites?.find((b) => b.id === boiteId) ?? null;

  const rafraichirBoites = useCallback(async () => {
    try {
      const bs = (await chargerBoites(sb)).filter((b) => (cote === "famille" ? !b.service : !!b.service));
      setBoites(bs);
      setBoiteId((cur) => (cur && bs.some((b) => b.id === cur) ? cur : (bs[0]?.id ?? null)));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Messagerie indisponible.");
    }
  }, [sb, cote]);

  const rafraichirFils = useCallback(async () => {
    if (!boiteId) return;
    try {
      setFils(await chargerFils(sb, boiteId));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Messagerie indisponible.");
    }
  }, [sb, boiteId]);

  useEffect(() => differe(rafraichirBoites), [rafraichirBoites]);
  useEffect(
    () =>
      differe(() => {
        setVue(null);
        rafraichirFils();
      }),
    [rafraichirFils],
  );

  // En direct : un fil a bougé (nouveau message, membre ajouté…) → liste relue, fil ouvert rechargé.
  useEffect(() => {
    const surSignal = () => {
      rafraichirFils();
      rafraichirBoites();
      setSignal((n) => n + 1);
    };
    const surRetour = () => document.visibilityState === "visible" && surSignal();
    window.addEventListener(EVT_SIGNAL, surSignal);
    document.addEventListener("visibilitychange", surRetour);
    return () => {
      window.removeEventListener(EVT_SIGNAL, surSignal);
      document.removeEventListener("visibilitychange", surRetour);
    };
  }, [rafraichirFils, rafraichirBoites]);

  const apresEcriture = async (filOuvert?: string) => {
    await Promise.all([rafraichirFils(), rafraichirBoites()]);
    signalerMaj();
    if (filOuvert) setVue({ t: "fil", id: filOuvert });
  };

  if (erreur) return <p className="rounded-lg bg-negative/10 px-3 py-2 text-[13px] text-negative">{erreur}</p>;
  if (!boites) return <p className="text-sm text-muted">Chargement…</p>;
  if (!boites.length)
    return (
      <p className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted">
        {cote === "famille" ? "La messagerie n'est pas disponible pour ce compte." : "Votre profil ne tient aucune boîte de la messagerie."}
      </p>
    );

  const filOuvert = vue?.t === "fil" ? fils.find((f) => f.id === vue.id) : undefined;
  const estService = !!boite?.service;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {boites.length > 1 &&
          boites.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setBoiteId(b.id)}
              className={`rounded-full px-3 py-1 text-[12.5px] ${b.id === boiteId ? "bg-accent text-accent-fg" : "bg-surface-2 text-foreground hover:bg-accent-soft"}`}
            >
              {b.libelle}
              {b.non_lus > 0 && <span className="ml-1.5 rounded-full bg-gold px-1.5 text-[10.5px] font-semibold text-white">{b.non_lus}</span>}
            </button>
          ))}
        {boites.length === 1 && (
          <span className="text-[12.5px] text-muted">
            Vous écrivez au nom de : <strong className="text-foreground">{boite?.libelle}</strong>
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <button type="button" className={bouton} onClick={() => setVue({ t: "nouveau" })}>
            + Nouveau message
          </button>
          {estService && (
            <button type="button" className={boutonDoux} onClick={() => setVue({ t: "groupe" })}>
              Envoi groupé
            </button>
          )}
        </div>
      </div>

      <div className="grid min-h-[28rem] gap-3 md:grid-cols-[minmax(16rem,22rem)_1fr]">
        {/* Liste des fils (masquée sur téléphone quand un fil est ouvert). */}
        <ul className={`overflow-hidden rounded-xl border border-border bg-surface ${vue ? "hidden md:block" : ""}`}>
          {!fils.length && <li className="p-4 text-center text-[13px] text-muted">Aucun message pour le moment.</li>}
          {fils.map((f) => (
            <li key={f.id} className="border-b border-border/60 last:border-b-0">
              <button
                type="button"
                onClick={() => setVue({ t: "fil", id: f.id })}
                className={`block w-full px-3 py-2.5 text-left hover:bg-surface-2/70 ${vue?.t === "fil" && vue.id === f.id ? "bg-accent-soft/60" : ""}`}
              >
                <div className="flex items-baseline gap-2">
                  {f.non_lu && <span className="h-2 w-2 shrink-0 rounded-full bg-gold" aria-label="Non lu" />}
                  {f.nb_participants > 2 && <Icon name="users" className="h-3.5 w-3.5 shrink-0 self-center text-muted" aria-label="Groupe" />}
                  <span className={`flex-1 truncate text-[13px] ${f.non_lu ? "font-semibold" : "font-medium"}`}>{f.participants ?? "—"}</span>
                  <span className="shrink-0 text-[11px] text-muted">{quand(f.dernier_le)}</span>
                </div>
                <div className={`truncate text-[12.5px] ${f.non_lu ? "text-foreground" : "text-muted"}`}>{f.sujet}</div>
                <div className="truncate text-[11.5px] text-muted">{f.apercu}</div>
                {f.signale && <span className="mt-0.5 inline-block rounded bg-negative/10 px-1.5 text-[10.5px] text-negative">Signalé à la Direction</span>}
              </button>
            </li>
          ))}
        </ul>

        <div className={`rounded-xl border border-border bg-surface ${vue ? "" : "hidden md:block"}`}>
          {!vue && (
            <div className="grid h-full place-items-center p-6 text-center text-[13px] text-muted">
              <div>
                <Icon name="bulle" className="mx-auto mb-2 h-8 w-8 text-gold" />
                Choisissez une conversation, ou écrivez un nouveau message.
              </div>
            </div>
          )}
          {vue?.t === "fil" && boite && (
            <FilOuvert
              key={vue.id}
              fil={filOuvert}
              filId={vue.id}
              boite={boite}
              signal={signal}
              onRetour={() => setVue(null)}
              onQuitte={() => apresEcriture().then(() => setVue(null))}
              onMaj={() => apresEcriture()}
            />
          )}
          {vue?.t === "nouveau" && boite && <NouveauMessage boite={boite} onAnnuler={() => setVue(null)} onEnvoye={(id) => apresEcriture(id)} />}
          {vue?.t === "groupe" && boite && <EnvoiGroupe boite={boite} onAnnuler={() => setVue(null)} onEnvoye={() => apresEcriture().then(() => setVue(null))} />}
        </div>
      </div>
    </div>
  );
}

/** Choix de fichiers à joindre (contrôlés avant dépôt) et leur liste. */
function Joindre({ fichiers, onChange, onErreur }: { fichiers: File[]; onChange: (f: File[]) => void; onErreur: (m: string | null) => void }) {
  const entree = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={entree}
        type="file"
        multiple
        accept={TYPES_ACCEPTES.join(",")}
        className="hidden"
        onChange={(e) => {
          const choisis = [...(e.target.files ?? [])];
          e.target.value = "";
          const refus = choisis.map(refusFichier).find(Boolean) ?? null;
          onErreur(refus);
          const ok = choisis.filter((f) => !refusFichier(f));
          onChange([...fichiers, ...ok].slice(0, 10));
        }}
      />
      <button type="button" onClick={() => entree.current?.click()} className="rounded-lg px-2 py-1.5 text-[13px] text-accent hover:bg-accent-soft" title="Joindre un fichier (images, PDF, Word, Excel ; 10 Mo au plus)">
        📎<span className="sr-only">Joindre un fichier</span>
      </button>
      {fichiers.length > 0 && (
        <div className="flex w-full flex-wrap gap-1.5">
          {fichiers.map((f, i) => (
            <span key={`${f.name}:${i}`} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-[12px]">
              {f.name} <span className="text-muted">({tailleLisible(f.size)})</span>
              <button type="button" aria-label={`Retirer ${f.name}`} onClick={() => onChange(fichiers.filter((_, k) => k !== i))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/** Pièces jointes d'un message : vignette pour les images, sinon une puce ; un clic ouvre le fichier (lien de 5 min). */
function PiecesJointes({ pj, claire }: { pj: PieceJointe[]; claire: boolean }) {
  const sb = useMemo(() => createClient(), []);
  const [vignettes, setVignettes] = useState<Record<string, string>>({});
  useEffect(() => {
    let vivant = true;
    for (const p of pj.filter((x) => x.type.startsWith("image/") && x.type !== "image/heic"))
      lienPj(sb, p.path)
        .then((u) => vivant && setVignettes((v) => ({ ...v, [p.path]: u })))
        .catch(() => undefined);
    return () => {
      vivant = false;
    };
  }, [sb, pj]);
  const ouvrir = async (p: PieceJointe) => {
    try {
      window.open(await lienPj(sb, p.path, p.type.startsWith("image/") || p.type === "application/pdf" ? undefined : p.nom), "_blank", "noopener");
    } catch {
      window.alert("Fichier indisponible.");
    }
  };
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {pj.map((p) =>
        vignettes[p.path] ? (
          <button key={p.path} type="button" onClick={() => ouvrir(p)} title={p.nom}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={vignettes[p.path]} alt={p.nom} className="max-h-40 max-w-[14rem] rounded-lg object-cover" />
          </button>
        ) : (
          <button
            key={p.path}
            type="button"
            onClick={() => ouvrir(p)}
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] underline-offset-2 hover:underline ${claire ? "bg-white/15" : "bg-background"}`}
          >
            📎 {p.nom} <span className="opacity-70">({tailleLisible(p.taille)})</span>
          </button>
        ),
      )}
    </div>
  );
}

function FilOuvert({
  fil,
  filId,
  boite,
  signal,
  onRetour,
  onQuitte,
  onMaj,
}: {
  fil: Fil | undefined;
  filId: string;
  boite: Boite;
  signal: number;
  onRetour: () => void;
  onQuitte: () => void;
  onMaj: () => void;
}) {
  const sb = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<MessageCom[] | null>(null);
  const [texte, setTexte] = useState("");
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [groupe, setGroupe] = useState(false);
  const fin = useRef<HTMLDivElement>(null);
  const direction = boite.service === "direction";

  const charger = useCallback(async () => {
    try {
      setMessages(await chargerMessages(sb, filId, boite.id));
      await sb.rpc("com_lu", { p_fil: filId, p_boite: boite.id });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Conversation indisponible.");
    }
  }, [sb, filId, boite.id]);

  useEffect(
    () => differe(() => charger().then(() => onMaj())),
    // onMaj : rafraîchit la liste et la pastille après lecture (une fois à l'ouverture).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [charger],
  );
  // Signal temps réel : le fil est relu (la liste l'est déjà par le parent).
  useEffect(() => (signal ? differe(charger) : undefined), [signal, charger]);
  useEffect(() => fin.current?.scrollIntoView({ block: "end" }), [messages]);

  async function agir(p: PromiseLike<{ error: { message: string } | null }>) {
    setOccupe(true);
    const { error } = await p;
    setOccupe(false);
    if (error) return setErreur(error.message);
    setErreur(null);
    await charger();
    onMaj();
  }

  const envoyer = async () => {
    if (!texte.trim() && !fichiers.length) return;
    setOccupe(true);
    try {
      const pj = await deposer(sb, boite.id, fichiers);
      const { error } = await sb.rpc("com_repondre", { p_fil: filId, p_boite: boite.id, p_texte: texte, p_pj: pj });
      if (error) throw new Error(error.message);
      setTexte("");
      setFichiers([]);
      setErreur(null);
      await charger();
      onMaj();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div className="flex h-full max-h-[75vh] flex-col">
      <div className="flex items-start gap-2 border-b border-border px-3 py-2">
        <button type="button" onClick={onRetour} className="text-[13px] text-accent md:hidden">
          ←
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold">{fil?.sujet ?? "Conversation"}</div>
          <div className="truncate text-[12px] text-muted">Avec : {fil?.participants ?? "—"}</div>
        </div>
        <button type="button" onClick={() => setGroupe((g) => !g)} className="shrink-0 text-[12px] text-accent hover:underline">
          {fil && fil.nb_participants > 2 ? `Groupe (${fil.nb_participants})` : "Participants"}
        </button>
        {fil?.entre_familles && !fil.signale && !boite.service && (
          <button
            type="button"
            disabled={occupe}
            onClick={() =>
              window.confirm("Signaler cette conversation à la Direction ? Elle pourra la lire et masquer un message inapproprié.") &&
              agir(sb.rpc("com_signaler", { p_fil: filId, p_boite: boite.id }))
            }
            className="shrink-0 text-[12px] text-negative hover:underline"
          >
            Signaler
          </button>
        )}
      </div>

      {groupe && fil && <PanneauGroupe fil={fil} boite={boite} signal={signal} onQuitte={onQuitte} onMaj={onMaj} />}

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {!messages && <p className="text-[13px] text-muted">Chargement…</p>}
        {messages?.map((m) => (
          <div key={m.id} className={`flex ${m.de_moi ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] ${m.de_moi ? "bg-accent text-accent-fg" : "bg-surface-2"}`}>
              {!m.de_moi && <div className="mb-0.5 text-[11px] font-semibold text-gold">{m.auteur}</div>}
              {m.masque && !m.texte ? (
                <p className="italic opacity-70">Message masqué par la Direction.</p>
              ) : (
                <>
                  {m.texte && <p className={`whitespace-pre-line ${m.masque ? "line-through opacity-70" : ""}`}>{m.texte}</p>}
                  {m.pj.length > 0 && <PiecesJointes pj={m.pj} claire={m.de_moi} />}
                </>
              )}
              <div className="mt-0.5 flex items-center gap-2 text-[10.5px] opacity-70">
                <span>{quand(m.created_at)}</span>
                {direction && !m.de_moi && (
                  <button type="button" disabled={occupe} onClick={() => agir(sb.rpc("com_masquer", { p_message: m.id, p_masquer: !m.masque }))} className="underline">
                    {m.masque ? "Rétablir" : "Masquer"}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={fin} />
      </div>

      {erreur && <p className="px-3 text-[12px] text-negative">{erreur}</p>}
      <div className="flex flex-wrap items-end gap-2 border-t border-border p-2">
        <Joindre fichiers={fichiers} onChange={setFichiers} onErreur={setErreur} />
        <textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) envoyer();
          }}
          rows={2}
          placeholder="Votre réponse… (Ctrl + Entrée pour envoyer)"
          className={`${champ} min-w-0 flex-1 resize-y`}
        />
        <button type="button" className={bouton} disabled={occupe || (!texte.trim() && !fichiers.length)} onClick={envoyer}>
          {occupe ? "Envoi…" : "Envoyer"}
        </button>
      </div>
    </div>
  );
}

/** Groupe : participants, ajout de membres, renommage (créateur), départ. */
function PanneauGroupe({ fil, boite, signal, onQuitte, onMaj }: { fil: Fil; boite: Boite; signal: number; onQuitte: () => void; onMaj: () => void }) {
  const sb = useMemo(() => createClient(), []);
  const [membres, setMembres] = useState<Participant[]>([]);
  const [ajout, setAjout] = useState<string[]>([]);
  const [ajouter, setAjouter] = useState(false);
  const [sujet, setSujet] = useState(fil.sujet);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(() => {
    chargerParticipants(sb, fil.id, boite.id)
      .then(setMembres)
      .catch((e) => setErreur(e instanceof Error ? e.message : "Participants indisponibles."));
  }, [sb, fil.id, boite.id]);
  useEffect(() => differe(charger), [charger, signal]);

  async function agir(p: PromiseLike<{ error: { message: string } | null }>, ensuite?: () => void) {
    const { error } = await p;
    if (error) return setErreur(error.message);
    setErreur(null);
    charger();
    onMaj();
    ensuite?.();
  }

  return (
    <div className="space-y-2 border-b border-border bg-surface-2/50 px-3 py-2 text-[12.5px]">
      {fil.cree_par_moi && (
        <div className="flex gap-2">
          <input value={sujet} onChange={(e) => setSujet(e.target.value)} className={`${champ} py-1`} aria-label="Nom du groupe" />
          <button
            type="button"
            className={boutonDoux}
            disabled={!sujet.trim() || sujet.trim() === fil.sujet}
            onClick={() => agir(sb.rpc("com_renommer", { p_fil: fil.id, p_boite: boite.id, p_sujet: sujet }))}
          >
            Renommer
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {membres.map((m) => (
          <span key={m.id} className={`rounded-full px-2.5 py-0.5 ${m.moi ? "bg-accent-soft text-accent" : "bg-surface"}`}>
            {m.libelle}
            {m.moi ? " (vous)" : ""}
          </span>
        ))}
      </div>
      {ajouter && <ChoixDestinataires choix={ajout} onChange={setAjout} exclure={membres.map((m) => m.id)} />}
      {erreur && <p className="text-negative">{erreur}</p>}
      <div className="flex flex-wrap gap-2">
        {!fil.envoi_groupe &&
          (ajouter ? (
            <>
              <button
                type="button"
                className={bouton}
                disabled={!ajout.length}
                onClick={() => agir(sb.rpc("com_ajouter", { p_fil: fil.id, p_boite: boite.id, p_destinataires: ajout }), () => {
                  setAjout([]);
                  setAjouter(false);
                })}
              >
                Ajouter au groupe
              </button>
              <button type="button" className={boutonDoux} onClick={() => setAjouter(false)}>
                Annuler
              </button>
            </>
          ) : (
            <button type="button" className={boutonDoux} onClick={() => setAjouter(true)}>
              + Ajouter des participants
            </button>
          ))}
        <button
          type="button"
          className="ml-auto text-negative hover:underline"
          onClick={() =>
            window.confirm("Quitter cette conversation ? Elle disparaîtra de votre liste.") && agir(sb.rpc("com_quitter", { p_fil: fil.id, p_boite: boite.id }), onQuitte)
          }
        >
          Quitter
        </button>
      </div>
    </div>
  );
}

/** Choix de destinataires dans l'annuaire (services de l'école, familles), avec recherche. */
function ChoixDestinataires({ choix, onChange, exclure = [] }: { choix: string[]; onChange: (c: string[]) => void; exclure?: string[] }) {
  const sb = useMemo(() => createClient(), []);
  const [annuaire, setAnnuaire] = useState<Destinataire[] | null>(null);
  const [recherche, setRecherche] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => {
    chargerAnnuaire(sb)
      .then(setAnnuaire)
      .catch((e) => setErreur(e instanceof Error ? e.message : "Annuaire indisponible."));
  }, [sb]);

  const norme = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const proposes = (annuaire ?? []).filter((d) => !choix.includes(d.id) && !exclure.includes(d.id) && (!recherche || norme(d.libelle).includes(norme(recherche))));
  const services = proposes.filter((d) => d.service);
  const familles = proposes.filter((d) => !d.service);
  const libelle = (id: string) => annuaire?.find((d) => d.id === id)?.libelle ?? "";
  const Option = ({ d }: { d: Destinataire }) => (
    <button type="button" onClick={() => onChange([...choix, d.id])} className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-accent-soft/60">
      {d.libelle}
    </button>
  );

  return (
    <div>
      {choix.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {choix.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-[12.5px] text-accent">
              {libelle(id)}
              <button type="button" aria-label={`Retirer ${libelle(id)}`} onClick={() => onChange(choix.filter((x) => x !== id))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un service ou une famille…" className={champ} />
      <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-surface">
        {!annuaire && !erreur && <p className="p-2 text-[12.5px] text-muted">Chargement…</p>}
        {erreur && <p className="p-2 text-[12.5px] text-negative">{erreur}</p>}
        {services.length > 0 && <div className="bg-surface-2 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">École</div>}
        {services.map((d) => (
          <Option key={d.id} d={d} />
        ))}
        {familles.length > 0 && <div className="bg-surface-2 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Familles</div>}
        {familles.map((d) => (
          <Option key={d.id} d={d} />
        ))}
        {annuaire && !proposes.length && <p className="p-2 text-[12.5px] text-muted">Aucun résultat.</p>}
      </div>
    </div>
  );
}

function NouveauMessage({ boite, onAnnuler, onEnvoye }: { boite: Boite; onAnnuler: () => void; onEnvoye: (fil: string) => void }) {
  const sb = useMemo(() => createClient(), []);
  const [choix, setChoix] = useState<string[]>([]);
  const [sujet, setSujet] = useState("");
  const [texte, setTexte] = useState("");
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer() {
    setOccupe(true);
    try {
      const pj = await deposer(sb, boite.id, fichiers);
      const { data, error } = await sb.rpc("com_nouveau_fil", { p_boite: boite.id, p_destinataires: choix, p_sujet: sujet, p_texte: texte, p_pj: pj });
      if (error) throw new Error(error.message);
      onEnvoye(data as string);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setOccupe(false);
    }
  }

  return (
    <div className="space-y-3 p-4">
      <div>
        <div className="text-[14px] font-semibold">Nouveau message</div>
        <p className="text-[12px] text-muted">Plusieurs destinataires : la conversation devient un groupe, où chacun lit et répond à tous.</p>
      </div>
      <div>
        <div className="mb-1 text-[12px] text-muted">Destinataire(s)</div>
        <ChoixDestinataires choix={choix} onChange={setChoix} />
      </div>
      <input value={sujet} onChange={(e) => setSujet(e.target.value)} placeholder={choix.length > 1 ? "Nom du groupe / sujet" : "Sujet"} className={champ} />
      <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={6} placeholder="Votre message…" className={`${champ} resize-y`} />
      <div className="flex flex-wrap items-center gap-2">
        <Joindre fichiers={fichiers} onChange={setFichiers} onErreur={setErreur} />
      </div>
      {erreur && <p className="text-[12px] text-negative">{erreur}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={boutonDoux} onClick={onAnnuler}>
          Annuler
        </button>
        <button type="button" className={bouton} disabled={occupe || !choix.length || !sujet.trim() || (!texte.trim() && !fichiers.length)} onClick={envoyer}>
          {occupe ? "Envoi…" : "Envoyer"}
        </button>
      </div>
    </div>
  );
}

function EnvoiGroupe({ boite, onAnnuler, onEnvoye }: { boite: Boite; onAnnuler: () => void; onEnvoye: () => void }) {
  const sb = useMemo(() => createClient(), []);
  const [classes, setClasses] = useState<{ id: string; nom: string }[]>([]);
  const [cible, setCible] = useState("");
  const [sujet, setSujet] = useState("");
  const [texte, setTexte] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    chargerClasses(sb).then(setClasses).catch(() => setClasses([]));
  }, [sb]);

  async function envoyer() {
    const nomCible = cible ? `les familles de la classe « ${classes.find((c) => c.id === cible)?.nom} »` : "toutes les familles de l'école";
    if (!window.confirm(`Envoyer ce message à ${nomCible} ? Chaque famille le reçoit dans une conversation privée avec ${boite.libelle}.`)) return;
    setOccupe(true);
    const { data, error } = await sb.rpc("com_envoi_groupe", { p_boite: boite.id, p_classe: cible || null, p_sujet: sujet, p_texte: texte });
    setOccupe(false);
    if (error) return setMessage(`Échec : ${error.message}`);
    window.alert(`Message envoyé à ${data as number} famille(s).`);
    onEnvoye();
  }

  return (
    <div className="space-y-3 p-4">
      <div>
        <div className="text-[14px] font-semibold">Envoi groupé · {boite.libelle}</div>
        <p className="text-[12px] text-muted">Chaque famille reçoit le message dans une conversation privée : sa réponse ne va qu&apos;à {boite.libelle}.</p>
      </div>
      <select value={cible} onChange={(e) => setCible(e.target.value)} className={champ}>
        <option value="">Toutes les familles de l&apos;école</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            Familles de la classe : {c.nom}
          </option>
        ))}
      </select>
      <input value={sujet} onChange={(e) => setSujet(e.target.value)} placeholder="Sujet" className={champ} />
      <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={7} placeholder="Votre message…" className={`${champ} resize-y`} />
      {message && <p className="text-[12px] text-negative">{message}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={boutonDoux} onClick={onAnnuler}>
          Annuler
        </button>
        <button type="button" className={bouton} disabled={occupe || !sujet.trim() || !texte.trim()} onClick={envoyer}>
          Envoyer
        </button>
      </div>
    </div>
  );
}
