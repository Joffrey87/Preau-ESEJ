"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Icon from "@/components/Icon";
import { Avatar, AvatarsGroupe, PastilleProfil } from "./Avatar";
import { PastilleNonLus } from "./NonLus";
import {
  BUCKET,
  FAMILLES_PROFIL,
  TAILLE_MAX_PJ,
  TYPES_PJ,
  autres,
  heureCourte,
  prenomVisite,
  profil,
  titreConversation,
  type Conversation,
  type Message,
  type Moi,
  type Participant,
  type PieceJointe,
} from "@/lib/messagerie";

type Choix = { mode: "direct" | "groupe" | "ajouter"; exclus?: string[] } | null;

const bouton = "inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[13px] hover:bg-surface-2 disabled:opacity-50";
const boutonPlein = "inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-fg hover:opacity-90 disabled:opacity-50";

function erreurTexte(e: unknown): string {
  const m = (e as { message?: string } | null)?.message ?? String(e);
  return m.replace(/^.*?ERROR:\s*/, "");
}

/** Messagerie interne : liste des conversations, fil de discussion, groupes, pièces jointes et modération. */
export default function Messagerie() {
  const supabase = useMemo(() => createClient(), []);
  const prenom = useMemo(() => prenomVisite(), []);
  const [moi, setMoi] = useState<Moi | null>(null);
  const [charge, setCharge] = useState(true);
  const [convs, setConvs] = useState<Conversation[]>([]);
  // Conversation demandée dans l'adresse (?c=…).
  const [actif, setActifBrut] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("c")));
  const [messages, setMessages] = useState<Message[]>([]);
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState("");
  const [tout, setTout] = useState(false);
  const [choix, setChoix] = useState<Choix>(null);
  const [reglages, setReglages] = useState(false);
  const [journal, setJournal] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [blocagesPerso, setBlocagesPerso] = useState<string[]>([]);
  const actifRef = useRef<string | null>(actif);
  useEffect(() => {
    actifRef.current = actif;
  }, [actif]);
  const setActif = useCallback((id: string | null) => {
    actifRef.current = id;
    setActifBrut(id);
    setMessages([]);
    setReglages(false);
  }, []);

  const rpc = useCallback(
    async <T,>(nom: string, args: Record<string, unknown> = {}): Promise<T> => {
      const { data, error } = await supabase.rpc(nom, { ...args, p_prenom: prenom });
      if (error) throw error;
      return data as T;
    },
    [supabase, prenom],
  );

  const chargerConvs = useCallback(async () => {
    try {
      setConvs((await rpc<Conversation[]>("msg_conversations_liste", { p_tout: tout })) ?? []);
    } catch (e) {
      setErreur(erreurTexte(e));
    }
  }, [rpc, tout]);

  const chargerMessages = useCallback(
    async (id: string) => {
      try {
        const liste = (await rpc<Message[]>("msg_messages_liste", { p_conv: id })) ?? [];
        if (actifRef.current === id) setMessages(liste);
        await rpc("msg_marquer_lu", { p_conv: id });
        window.dispatchEvent(new Event("msg-lu"));
      } catch (e) {
        setErreur(erreurTexte(e));
      }
    },
    [rpc],
  );

  useEffect(() => {
    void (async () => {
      try {
        setMoi(await rpc<Moi | null>("msg_moi"));
        setBlocagesPerso((await rpc<string[]>("msg_mes_blocages")) ?? []);
      } catch (e) {
        setErreur(erreurTexte(e));
      }
      setCharge(false);
    })();
  }, [rpc]);

  useEffect(() => {
    if (!moi) return;
    const t = setTimeout(() => void chargerConvs(), 0);
    return () => clearTimeout(t);
  }, [moi, chargerConvs]);

  useEffect(() => {
    if (!actif) return;
    const t = setTimeout(() => void chargerMessages(actif), 0);
    return () => clearTimeout(t);
  }, [actif, chargerMessages]);

  // Temps réel : chaque signal recharge la liste et, si c'est elle, la conversation ouverte. Secours : 20 s.
  useEffect(() => {
    if (!moi) return;
    const canal = supabase
      .channel(`msg-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "msg_signaux" }, (p) => {
        void chargerConvs();
        const conv = (p.new as { conversation?: string } | null)?.conversation;
        if (actifRef.current && (!conv || conv === actifRef.current)) void chargerMessages(actifRef.current);
      })
      .subscribe();
    const t = setInterval(() => {
      void chargerConvs();
      if (actifRef.current) void chargerMessages(actifRef.current);
    }, 20000);
    return () => {
      clearInterval(t);
      void supabase.removeChannel(canal);
    };
  }, [moi, supabase, chargerConvs, chargerMessages]);

  const conv = convs.find((c) => c.id === actif) ?? null;

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const types = FAMILLES_PROFIL.find((f) => f.v === filtre)?.types ?? (filtre ? [filtre] : null);
    return convs.filter((c) => {
      const autresP = moi ? autres(c, moi.cle) : c.membres ?? [];
      if (types && !autresP.some((p) => types.includes(p.type))) return false;
      if (!q) return true;
      const texte = [c.titre, c.dernier?.corps, ...autresP.flatMap((p) => [p.libelle, p.detail, profil(p.type).label])].join(" ").toLowerCase();
      return texte.includes(q);
    });
  }, [convs, recherche, filtre, moi]);

  async function ouvrirDirect(cle: string) {
    try {
      const id = await rpc<string>("msg_ouvrir_direct", { p_cible: cle });
      setChoix(null);
      setTout(false);
      await chargerConvs();
      setActif(id);
    } catch (e) {
      setErreur(erreurTexte(e));
    }
  }

  async function creerGroupe(titre: string, membres: string[]) {
    try {
      const id = await rpc<string>("msg_creer_groupe", { p_titre: titre, p_membres: membres });
      setChoix(null);
      await chargerConvs();
      setActif(id);
    } catch (e) {
      setErreur(erreurTexte(e));
    }
  }

  async function action(nom: string, args: Record<string, unknown>) {
    try {
      await rpc(nom, args);
      await chargerConvs();
      if (actif) await chargerMessages(actif);
    } catch (e) {
      setErreur(erreurTexte(e));
    }
  }

  if (charge) return <div className="p-6 text-sm text-muted">Chargement de la messagerie…</div>;
  if (!moi)
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-sm">
        La messagerie n’a pas pu vous identifier. {erreur ? <span className="text-negative">{erreur}</span> : "Reconnectez-vous puis réessayez."}
      </div>
    );

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-[28rem] overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      {/* ───── Liste ───── */}
      <section className={`${actif ? "max-md:hidden" : ""} flex w-full flex-col border-r border-border md:w-[21rem] md:shrink-0`}>
        <div className="border-b border-border p-3">
          <div className="mb-2 flex items-center gap-2">
            <Avatar p={moi} taille="sm" />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[13px] font-semibold">{moi.libelle}</div>
              <div className="flex items-center gap-1 text-[11px] text-muted">
                <PastilleProfil type={moi.type} />
                {moi.detail && <span className="truncate">{moi.detail}</span>}
              </div>
            </div>
          </div>
          <div className="flex gap-1.5">
            <button className={`${boutonPlein} flex-1 justify-center`} disabled={moi.bloque} onClick={() => setChoix({ mode: "direct" })}>
              <Icon name="plus" className="h-4 w-4" /> Message
            </button>
            <button className={`${bouton} flex-1 justify-center`} disabled={moi.bloque} onClick={() => setChoix({ mode: "groupe" })}>
              <Icon name="users" className="h-4 w-4" /> Groupe
            </button>
          </div>
          <label className="relative mt-2 block">
            <Icon name="loupe" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher une conversation, un nom…"
              className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-2 text-[13px] outline-none focus:border-accent"
            />
          </label>
          <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none]">
            {[{ v: "", label: "Tous" }, ...FAMILLES_PROFIL].map((f) => (
              <button
                key={f.v}
                onClick={() => setFiltre(f.v)}
                className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11.5px] transition-colors ${
                  filtre === f.v ? "border-accent bg-accent-soft font-medium text-accent" : "border-border text-muted hover:bg-surface-2"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {FAMILLES_PROFIL.find((f) => f.v === "admin")?.v === filtre && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {FAMILLES_PROFIL[1].types.map((t) => (
                <button key={t} onClick={() => setFiltre(t)} className="rounded-full">
                  <PastilleProfil type={t} className="hover:opacity-80" />
                </button>
              ))}
            </div>
          )}
          {FAMILLES_PROFIL[1].types.includes(filtre) && (
            <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted">
              Filtré sur <PastilleProfil type={filtre} />
              <button className="ml-1 underline" onClick={() => setFiltre("admin")}>tous les rôles</button>
            </div>
          )}
          {moi.moderateur && (
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-surface-2 px-2 py-1.5 text-[12px]">
              <Icon name="bouclier" className="h-4 w-4 shrink-0 text-accent" />
              <label className="flex flex-1 cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={tout} onChange={(e) => setTout(e.target.checked)} className="accent-[var(--accent)]" />
                Toutes les conversations
              </label>
              <button className="text-accent hover:underline" onClick={() => setJournal(true)}>Journal</button>
            </div>
          )}
        </div>
        <ul className="flex-1 overflow-y-auto">
          {visibles.map((c) => {
            const a = autres(c, moi.cle);
            const titre = titreConversation(c, moi.cle);
            const ouvert = c.id === actif;
            return (
              <li key={c.id}>
                <button
                  onClick={() => setActif(c.id)}
                  className={`flex w-full items-center gap-2.5 border-b border-border/60 px-3 py-2.5 text-left transition-colors ${
                    ouvert ? "bg-accent-soft" : "hover:bg-surface-2"
                  }`}
                >
                  {c.type === "groupe" ? <AvatarsGroupe membres={a.length ? a : (c.membres ?? [])} /> : <Avatar p={a[0] ?? { type: "inconnu", libelle: titre }} />}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className={`truncate text-[13px] ${c.non_lus ? "font-semibold" : "font-medium"}`}>{titre}</span>
                      {c.sourdine && <Icon name="sourdine" className="h-3.5 w-3.5 shrink-0 text-muted" />}
                      <span className="ml-auto shrink-0 text-[10.5px] text-muted">{heureCourte(c.dernier_le)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      {c.type === "direct" && a[0] ? <PastilleProfil type={a[0].type} /> : <span className="text-[10.5px] text-muted">{(c.membres ?? []).length} membres</span>}
                      {c.type === "direct" && a[0]?.detail && <span className="truncate text-[11px] text-muted">{a[0].detail}</span>}
                      {!c.moi_membre && <span className="rounded bg-gold-soft px-1 text-[10px] text-gold">modération</span>}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      <span className={`line-clamp-1 flex-1 text-[12px] ${c.non_lus ? "text-foreground" : "text-muted"}`}>
                        {c.dernier ? `${c.dernier.auteur === moi.cle ? "Vous : " : c.type === "groupe" ? c.dernier.auteur_libelle.split(" · ")[0] + " : " : ""}${c.dernier.corps || (c.dernier.pj ? "📎 Pièce jointe" : "")}` : "Aucun message"}
                      </span>
                      <PastilleNonLus n={c.non_lus} />
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {visibles.length === 0 && (
            <li className="px-4 py-10 text-center text-[13px] text-muted">
              <Icon name="bulles" className="mx-auto mb-2 h-8 w-8 opacity-50" />
              {convs.length ? "Aucune conversation ne correspond." : "Pas encore de conversation. Écrivez à quelqu’un avec « Message »."}
            </li>
          )}
        </ul>
      </section>

      {/* ───── Fil ───── */}
      <section className={`${actif ? "" : "max-md:hidden"} flex min-w-0 flex-1 flex-col bg-background/60`}>
        {conv ? (
          <Fil
            key={conv.id}
            conv={conv}
            moi={moi}
            messages={messages}
            supabase={supabase}
            rpc={rpc}
            onRetour={() => setActif(null)}
            onEnvoye={() => {
              void chargerMessages(conv.id);
              void chargerConvs();
            }}
            onAction={action}
            onReglages={() => setReglages((r) => !r)}
            bloquePerso={blocagesPerso}
            onBlocagePerso={async (cle, b) => {
              await action("msg_bloquer_perso", { p_cible: cle, p_bloque: b });
              setBlocagesPerso((await rpc<string[]>("msg_mes_blocages")) ?? []);
            }}
            setErreur={setErreur}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent">
              <Icon name="bulles" className="h-8 w-8" />
            </span>
            <div className="text-[15px] font-medium text-foreground">Messagerie Préau</div>
            <p className="max-w-sm text-[13px]">Échangez avec les familles, l’équipe de l’école, la Recherche de fonds, l’Événement et les professeurs.</p>
          </div>
        )}
      </section>

      {conv && reglages && conv.type === "groupe" && (
        <ReglagesGroupe conv={conv} moi={moi} onFermer={() => setReglages(false)} onAction={action} onAjouter={() => setChoix({ mode: "ajouter", exclus: (conv.membres ?? []).map((m) => m.cle) })} />
      )}

      {choix && (
        <Choisir
          mode={choix.mode}
          exclus={choix.exclus ?? []}
          rpc={rpc}
          onFermer={() => setChoix(null)}
          onDirect={ouvrirDirect}
          onGroupe={creerGroupe}
          onAjouter={async (cles) => {
            for (const c of cles) await action("msg_groupe_action", { p_conv: conv?.id, p_action: "ajouter", p_cible: c });
            setChoix(null);
          }}
        />
      )}
      {journal && <JournalModeration rpc={rpc} onFermer={() => setJournal(false)} onDebloquer={(c) => action("msg_bloquer_utilisateur", { p_cible: c, p_bloque: false })} />}

      {erreur && (
        <div role="alert" className="fixed bottom-4 left-1/2 z-50 flex max-w-md -translate-x-1/2 items-center gap-3 rounded-xl border border-negative/40 bg-surface px-4 py-2.5 text-[13px] shadow-lg">
          <span className="text-negative">{erreur}</span>
          <button className="text-muted hover:text-foreground" onClick={() => setErreur(null)} aria-label="Fermer">
            <Icon name="croix" className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Fil de discussion ───────────────────────── */

function Fil({
  conv,
  moi,
  messages,
  supabase,
  rpc,
  onRetour,
  onEnvoye,
  onAction,
  onReglages,
  bloquePerso,
  onBlocagePerso,
  setErreur,
}: {
  conv: Conversation;
  moi: Moi;
  messages: Message[];
  supabase: ReturnType<typeof createClient>;
  rpc: <T>(nom: string, args?: Record<string, unknown>) => Promise<T>;
  onRetour: () => void;
  onEnvoye: () => void;
  onAction: (nom: string, args: Record<string, unknown>) => Promise<void>;
  onReglages: () => void;
  bloquePerso: string[];
  onBlocagePerso: (cle: string, b: boolean) => Promise<void>;
  setErreur: (e: string | null) => void;
}) {
  const [texte, setTexte] = useState("");
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [menu, setMenu] = useState(false);
  const bas = useRef<HTMLDivElement>(null);
  const champFichier = useRef<HTMLInputElement>(null);
  const a = autres(conv, moi.cle);
  const titre = titreConversation(conv, moi.cle);
  const peutModerer = moi.moderateur || (conv.type === "groupe" && conv.admin);
  const peutEcrire = conv.moi_membre && !conv.bloque && !moi.bloque;
  const autreDirect = conv.type === "direct" ? a[0] : undefined;

  useEffect(() => {
    bas.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function ajouterFichiers(liste: FileList | null) {
    const ok: File[] = [];
    for (const f of Array.from(liste ?? [])) {
      if (!TYPES_PJ.includes(f.type)) setErreur(`« ${f.name} » : seules les photos et les PDF sont acceptés.`);
      else if (f.size > TAILLE_MAX_PJ) setErreur(`« ${f.name} » dépasse 10 Mo.`);
      else ok.push(f);
    }
    setFichiers((fs) => [...fs, ...ok].slice(0, 10));
  }

  async function envoyer() {
    if (envoi || (!texte.trim() && fichiers.length === 0)) return;
    setEnvoi(true);
    try {
      const pj: PieceJointe[] = [];
      for (const f of fichiers) {
        const propre = f.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.-]+/g, "_").slice(-80);
        const path = `${conv.id}/${crypto.randomUUID()}-${propre}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type });
        if (error) throw error;
        pj.push({ path, nom: f.name, type: f.type, taille: f.size });
      }
      await rpc("msg_envoyer", { p_conv: conv.id, p_corps: texte.trim(), p_pj: pj });
      setTexte("");
      setFichiers([]);
      onEnvoye();
    } catch (e) {
      setErreur(erreurTexte(e));
    }
    setEnvoi(false);
  }

  // Regroupe les messages par jour.
  const jours = messages.map((m) => new Date(m.cree_le).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }));

  return (
    <>
      <header className="flex items-center gap-2.5 border-b border-border bg-surface px-3 py-2.5">
        <button onClick={onRetour} className="rounded-md p-1 hover:bg-surface-2 md:hidden" aria-label="Retour">
          <Icon name="avancer" className="h-5 w-5 rotate-180" />
        </button>
        {conv.type === "groupe" ? <AvatarsGroupe membres={a.length ? a : (conv.membres ?? [])} /> : <Avatar p={autreDirect ?? { type: "inconnu", libelle: titre }} />}
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[14px] font-semibold">{titre}</div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted">
            {autreDirect ? (
              <>
                <PastilleProfil type={autreDirect.type} />
                {autreDirect.detail && <span className="truncate">{autreDirect.detail}</span>}
              </>
            ) : (
              <span className="truncate">{(conv.membres ?? []).map((m) => m.libelle + (m.detail && m.cle.startsWith("role:") ? ` (${m.detail})` : "")).join(", ")}</span>
            )}
          </div>
        </div>
        <div className="relative">
          <button onClick={() => setMenu((m) => !m)} className="rounded-md px-2 py-1 text-lg leading-none text-muted hover:bg-surface-2" aria-label="Options">
            ⋯
          </button>
          {menu && (
            <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-xl border border-border bg-surface p-1 text-[13px] shadow-lg" onMouseLeave={() => setMenu(false)}>
              {conv.moi_membre && (
                <MenuItem onClick={() => { setMenu(false); void onAction("msg_groupe_action", { p_conv: conv.id, p_action: "sourdine", p_valeur: conv.sourdine ? "non" : "oui" }); }}>
                  {conv.sourdine ? "Réactiver les alertes" : "Mettre en sourdine"}
                </MenuItem>
              )}
              {conv.type === "groupe" && (
                <MenuItem onClick={() => { setMenu(false); onReglages(); }}>Membres et réglages du groupe</MenuItem>
              )}
              {conv.type === "groupe" && conv.moi_membre && (
                <MenuItem danger onClick={() => { setMenu(false); if (confirm("Quitter ce groupe ?")) void onAction("msg_groupe_action", { p_conv: conv.id, p_action: "quitter" }); }}>
                  Quitter le groupe
                </MenuItem>
              )}
              {autreDirect && (
                <MenuItem danger={!bloquePerso.includes(autreDirect.cle)} onClick={() => { setMenu(false); void onBlocagePerso(autreDirect.cle, !bloquePerso.includes(autreDirect.cle)); }}>
                  {bloquePerso.includes(autreDirect.cle) ? `Ne plus bloquer ${autreDirect.libelle}` : `Bloquer ${autreDirect.libelle}`}
                </MenuItem>
              )}
              {moi.moderateur && autreDirect && (
                <MenuItem danger onClick={() => { setMenu(false); const motif = prompt(`Bloquer ${autreDirect.libelle} dans toute la messagerie ? Motif :`); if (motif !== null) void onAction("msg_bloquer_utilisateur", { p_cible: autreDirect.cle, p_bloque: true, p_motif: motif }); }}>
                  Modération : bloquer l’utilisateur
                </MenuItem>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-4 md:px-6">
        {messages.length === 0 && <div className="py-10 text-center text-[13px] text-muted">Aucun message pour l’instant. Dites bonjour 👋</div>}
        {messages.map((m, i) => {
          const mien = m.auteur === moi.cle;
          const jour = jours[i];
          const sep = i === 0 || jour !== jours[i - 1];
          const suite = !sep && i > 0 && messages[i - 1].auteur === m.auteur;
          const [nom, detail] = m.auteur_libelle.split(" · ");
          return (
            <div key={m.id}>
              {sep && (
                <div className="my-3 flex items-center gap-3 text-[11px] text-muted">
                  <span className="h-px flex-1 bg-border" />
                  <span className="first-letter:uppercase">{jour}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}
              <div className={`group flex items-end gap-2 ${mien ? "flex-row-reverse" : ""} ${suite ? "mt-0.5" : "mt-3"}`}>
                {!mien && (suite ? <span className="w-7 shrink-0" /> : <Avatar p={{ type: m.type, libelle: nom }} taille="sm" />)}
                <div className={`flex max-w-[78%] flex-col ${mien ? "items-end" : "items-start"}`}>
                  {!mien && !suite && (
                    <div className="mb-0.5 flex items-center gap-1.5 px-1 text-[11px]">
                      <span className="font-medium">{nom}</span>
                      <PastilleProfil type={m.type} />
                      {detail && <span className="text-muted">{detail}</span>}
                    </div>
                  )}
                  <div
                    className={`relative rounded-2xl px-3 py-2 text-[13.5px] leading-snug shadow-sm ${
                      m.supprime || (m.masque && !m.corps)
                        ? "border border-dashed border-border bg-transparent italic text-muted"
                        : mien
                          ? `bg-accent text-accent-fg ${suite ? "rounded-tr-md" : "rounded-br-md"}`
                          : `border border-border bg-surface ${suite ? "rounded-tl-md" : "rounded-bl-md"}`
                    } ${m.masque && m.corps ? "opacity-60 ring-2 ring-gold/60" : ""}`}
                  >
                    {m.supprime ? (
                      "Message supprimé"
                    ) : m.masque && !m.corps ? (
                      "Message masqué par la modération"
                    ) : (
                      <>
                        {m.masque && <div className="mb-1 text-[10.5px] font-medium not-italic text-gold">Masqué (visible par la modération)</div>}
                        {m.corps && <div className="whitespace-pre-wrap break-words">{m.corps}</div>}
                        {m.pj.length > 0 && (
                          <div className={`${m.corps ? "mt-2" : ""} flex flex-wrap gap-1.5`}>
                            {m.pj.map((p) => <VuePJ key={p.path} pj={p} supabase={supabase} mien={mien} />)}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className={`mt-0.5 flex items-center gap-2 px-1 text-[10.5px] text-muted ${mien ? "flex-row-reverse" : ""}`}>
                    <span>{new Date(m.cree_le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                    {!m.supprime && (mien || peutModerer) && (
                      <span className="flex gap-2 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100">
                        {peutModerer && !mien && (
                          <button className="hover:text-gold" onClick={() => void onAction("msg_moderer_message", { p_msg: m.id, p_action: m.masque ? "afficher" : "masquer" })}>
                            {m.masque ? "Réafficher" : "Masquer"}
                          </button>
                        )}
                        <button className="hover:text-negative" onClick={() => confirm("Supprimer ce message pour tout le monde ?") && void onAction("msg_moderer_message", { p_msg: m.id, p_action: "supprimer" })}>
                          Supprimer
                        </button>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bas} />
      </div>

      {peutEcrire ? (
        <div className="border-t border-border bg-surface p-2.5">
          {fichiers.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {fichiers.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2 py-1 text-[12px]">
                  <Icon name={f.type === "application/pdf" ? "invoice" : "trombone"} className="h-3.5 w-3.5" />
                  <span className="max-w-[10rem] truncate">{f.name}</span>
                  <button onClick={() => setFichiers((fs) => fs.filter((_, j) => j !== i))} aria-label="Retirer">
                    <Icon name="croix" className="h-3.5 w-3.5 text-muted" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div
            className="flex items-end gap-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              ajouterFichiers(e.dataTransfer.files);
            }}
          >
            <button onClick={() => champFichier.current?.click()} className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-accent" title="Joindre une photo ou un PDF">
              <Icon name="trombone" className="h-5 w-5" />
            </button>
            <input ref={champFichier} type="file" multiple accept={TYPES_PJ.join(",")} className="hidden" onChange={(e) => { ajouterFichiers(e.target.files); e.target.value = ""; }} />
            <textarea
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void envoyer();
                }
              }}
              rows={Math.min(5, Math.max(1, texte.split("\n").length))}
              placeholder="Écrire un message…  (Maj+Entrée : nouvelle ligne)"
              className="max-h-40 min-h-[2.4rem] flex-1 resize-none rounded-2xl border border-border bg-background px-3.5 py-2 text-[13.5px] outline-none focus:border-accent"
            />
            <button onClick={() => void envoyer()} disabled={envoi || (!texte.trim() && !fichiers.length)} className="rounded-full bg-accent p-2.5 text-accent-fg shadow-sm hover:opacity-90 disabled:opacity-40" aria-label="Envoyer">
              <Icon name="envoyer" className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t border-border bg-surface-2 px-4 py-3 text-center text-[12.5px] text-muted">
          {!conv.moi_membre ? "Lecture en modération : vous ne faites pas partie de cette conversation." : moi.bloque ? "Votre messagerie a été bloquée par la modération." : "Un administrateur du groupe vous empêche d’écrire ici."}
        </div>
      )}
    </>
  );
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`block w-full rounded-lg px-3 py-1.5 text-left hover:bg-surface-2 ${danger ? "text-negative" : ""}`}>
      {children}
    </button>
  );
}

/** Pièce jointe : vignette pour une photo, étiquette pour un PDF ; lien signé valable 1 h. */
function VuePJ({ pj, supabase, mien }: { pj: PieceJointe; supabase: ReturnType<typeof createClient>; mien: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let ok = true;
    void supabase.storage.from(BUCKET).createSignedUrl(pj.path, 3600).then(({ data }) => ok && setUrl(data?.signedUrl ?? null));
    return () => {
      ok = false;
    };
  }, [pj.path, supabase]);
  if (pj.type.startsWith("image/"))
    return (
      <a href={url ?? undefined} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={pj.nom} className="max-h-56 max-w-[14rem] object-cover" />
        ) : (
          <span className="block h-32 w-40 animate-pulse bg-surface-2" />
        )}
      </a>
    );
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[12px] ${mien ? "bg-white/15 hover:bg-white/25" : "bg-surface-2 hover:bg-accent-soft"}`}
    >
      <span className="rounded bg-negative px-1 text-[9px] font-bold text-white">PDF</span>
      <span className="max-w-[12rem] truncate">{pj.nom}</span>
      <span className="opacity-70">{Math.max(1, Math.round(pj.taille / 1024))} Ko</span>
    </a>
  );
}

/* ───────────────────────── Choix des destinataires ───────────────────────── */

function Choisir({
  mode,
  exclus,
  rpc,
  onFermer,
  onDirect,
  onGroupe,
  onAjouter,
}: {
  mode: "direct" | "groupe" | "ajouter";
  exclus: string[];
  rpc: <T>(nom: string, args?: Record<string, unknown>) => Promise<T>;
  onFermer: () => void;
  onDirect: (cle: string) => void;
  onGroupe: (titre: string, membres: string[]) => void;
  onAjouter: (cles: string[]) => void;
}) {
  const [annuaire, setAnnuaire] = useState<Participant[]>([]);
  const [q, setQ] = useState("");
  const [choisis, setChoisis] = useState<string[]>([]);
  const [titre, setTitre] = useState("");
  useEffect(() => {
    void rpc<Participant[]>("msg_annuaire").then((a) => setAnnuaire(a ?? []));
  }, [rpc]);
  const multi = mode !== "direct";
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // Familles d'abord, puis Administration, Recherche de fonds, Événement, Professeurs.
  const rang = (t: string) => ["famille", "admin", "recherche-fonds", "evenement", "professeur"].indexOf(FAMILLES_PROFIL.find((f) => f.types.includes(t))?.v ?? "") ;
  const liste = annuaire
    .filter((p) => !exclus.includes(p.cle))
    .filter((p) => !q.trim() || norm(`${p.libelle} ${p.detail ?? ""} ${profil(p.type).label}`).includes(norm(q.trim())))
    .sort((x, y) => rang(x.type) - rang(y.type) || x.libelle.localeCompare(y.libelle, "fr"));
  const groupes = FAMILLES_PROFIL.map((f) => ({ ...f, membres: liste.filter((p) => f.types.includes(p.type)) })).filter((g) => g.membres.length);
  const titreFenetre = mode === "direct" ? "Nouveau message" : mode === "groupe" ? "Nouveau groupe" : "Ajouter des membres";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 md:items-center md:p-6" onClick={onFermer}>
      <div className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-surface shadow-xl md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-[15px] font-semibold">{titreFenetre}</h2>
          <button onClick={onFermer} aria-label="Fermer"><Icon name="croix" className="h-5 w-5 text-muted" /></button>
        </div>
        <div className="space-y-2 border-b border-border p-3">
          {mode === "groupe" && (
            <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Nom du groupe (ex. : Classe de CM1, Kermesse 2026)" className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-[13px] outline-none focus:border-accent" />
          )}
          <label className="relative block">
            <Icon name="loupe" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un nom, une famille, un rôle…" className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-2 text-[13px] outline-none focus:border-accent" />
          </label>
          {multi && choisis.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {choisis.map((c) => {
                const p = annuaire.find((x) => x.cle === c);
                return (
                  <button key={c} onClick={() => setChoisis((cs) => cs.filter((x) => x !== c))} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] ${profil(p?.type).pastille}`}>
                    {p?.libelle} <Icon name="croix" className="h-3 w-3" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {groupes.map((g) => (
            <div key={g.v}>
              <div className="sticky top-0 bg-surface-2/95 px-4 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted backdrop-blur">{g.label}</div>
              {g.membres.map((p) => {
                const coche = choisis.includes(p.cle);
                return (
                  <button
                    key={p.cle}
                    onClick={() => (multi ? setChoisis((cs) => (coche ? cs.filter((x) => x !== p.cle) : [...cs, p.cle])) : onDirect(p.cle))}
                    className={`flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-surface-2 ${coche ? "bg-accent-soft" : ""}`}
                  >
                    <Avatar p={p} taille="sm" />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-[13px] font-medium">{p.libelle}</span>
                      {p.detail && <span className="block truncate text-[11.5px] text-muted">{p.detail}</span>}
                    </span>
                    <PastilleProfil type={p.type} />
                    {multi && <input type="checkbox" readOnly checked={coche} className="accent-[var(--accent)]" />}
                  </button>
                );
              })}
            </div>
          ))}
          {groupes.length === 0 && <div className="p-6 text-center text-[13px] text-muted">{annuaire.length ? "Personne ne correspond." : "Chargement…"}</div>}
        </div>
        {multi && (
          <div className="flex items-center justify-end gap-2 border-t border-border p-3">
            <span className="mr-auto text-[12px] text-muted">{choisis.length} sélectionné{choisis.length > 1 ? "s" : ""}</span>
            <button className={bouton} onClick={onFermer}>Annuler</button>
            <button
              className={boutonPlein}
              disabled={!choisis.length || (mode === "groupe" && !titre.trim())}
              onClick={() => (mode === "groupe" ? onGroupe(titre.trim(), choisis) : onAjouter(choisis))}
            >
              {mode === "groupe" ? "Créer le groupe" : "Ajouter"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Réglages d'un groupe ───────────────────────── */

function ReglagesGroupe({
  conv,
  moi,
  onFermer,
  onAction,
  onAjouter,
}: {
  conv: Conversation;
  moi: Moi;
  onFermer: () => void;
  onAction: (nom: string, args: Record<string, unknown>) => Promise<void>;
  onAjouter: () => void;
}) {
  const gere = conv.admin || moi.moderateur;
  const [titre, setTitre] = useState(conv.titre ?? "");
  const [description, setDescription] = useState(conv.description ?? "");
  const act = (p_action: string, p_cible?: string, p_valeur?: string) => onAction("msg_groupe_action", { p_conv: conv.id, p_action, p_cible, p_valeur });
  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col border-l border-border bg-surface shadow-xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-[15px] font-semibold">Réglages du groupe</h2>
        <button onClick={onFermer} aria-label="Fermer"><Icon name="croix" className="h-5 w-5 text-muted" /></button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-[13px]">
        {gere ? (
          <div className="space-y-2">
            <label className="block text-[11.5px] text-muted">Nom</label>
            <div className="flex gap-1.5">
              <input value={titre} onChange={(e) => setTitre(e.target.value)} className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 outline-none focus:border-accent" />
              <button className={bouton} disabled={!titre.trim() || titre === conv.titre} onClick={() => void act("renommer", undefined, titre)}>Renommer</button>
            </div>
            <label className="block text-[11.5px] text-muted">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 outline-none focus:border-accent" />
            {description !== (conv.description ?? "") && <button className={bouton} onClick={() => void act("description", undefined, description)}>Enregistrer la description</button>}
          </div>
        ) : (
          conv.description && <p className="text-muted">{conv.description}</p>
        )}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">{(conv.membres ?? []).length} membres</span>
            {gere && <button className="text-accent hover:underline" onClick={onAjouter}>+ Ajouter</button>}
          </div>
          <ul className="space-y-1">
            {(conv.membres ?? []).map((m) => (
              <li key={m.cle} className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-surface-2">
                <Avatar p={m} taille="sm" />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{m.libelle}{m.cle === moi.cle ? " (vous)" : ""}</span>
                    {m.admin && <span className="rounded bg-accent-soft px-1 text-[10px] text-accent">admin</span>}
                    {m.bloque && <span className="rounded bg-negative/15 px-1 text-[10px] text-negative">bloqué</span>}
                  </span>
                  <span className="flex items-center gap-1"><PastilleProfil type={m.type} />{m.detail && <span className="truncate text-[11px] text-muted">{m.detail}</span>}</span>
                </span>
                {gere && m.cle !== moi.cle && (
                  <select
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "retirer" && !confirm(`Retirer ${m.libelle} du groupe ?`)) return;
                      void act(v, m.cle);
                    }}
                    className="rounded-md border border-border bg-background px-1 py-0.5 text-[11.5px]"
                    aria-label={`Actions pour ${m.libelle}`}
                  >
                    <option value="">Actions…</option>
                    <option value={m.admin ? "retirer_admin" : "nommer_admin"}>{m.admin ? "Retirer admin" : "Nommer admin"}</option>
                    <option value={m.bloque ? "debloquer" : "bloquer"}>{m.bloque ? "Autoriser à écrire" : "Empêcher d’écrire"}</option>
                    <option value="retirer">Retirer du groupe</option>
                  </select>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="space-y-2 border-t border-border p-4">
        {conv.moi_membre && (
          <button className={`${bouton} w-full justify-center`} onClick={() => void act("sourdine", undefined, conv.sourdine ? "non" : "oui")}>
            <Icon name="sourdine" className="h-4 w-4" /> {conv.sourdine ? "Réactiver les alertes" : "Mettre en sourdine"}
          </button>
        )}
        {gere && (
          <button
            className={`${bouton} w-full justify-center border-negative/40 text-negative`}
            onClick={() => {
              if (confirm("Supprimer ce groupe pour tous ses membres ?")) {
                void act("supprimer");
                onFermer();
              }
            }}
          >
            <Icon name="corbeille" className="h-4 w-4" /> Supprimer le groupe
          </button>
        )}
      </div>
    </aside>
  );
}

/* ───────────────────────── Journal de modération ───────────────────────── */

type Journal = {
  journal: { quand: string; auteur: string; action: string; cible: string | null; detail: string | null; conversation: string | null }[];
  bloques: (Participant & { motif: string | null; le: string })[];
};

function JournalModeration({ rpc, onFermer, onDebloquer }: { rpc: <T>(nom: string, args?: Record<string, unknown>) => Promise<T>; onFermer: () => void; onDebloquer: (cle: string) => Promise<void> }) {
  const [j, setJ] = useState<Journal | null>(null);
  const charger = useCallback(() => void rpc<Journal>("msg_moderation_liste").then(setJ), [rpc]);
  useEffect(charger, [charger]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onFermer}>
      <div className="flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Icon name="bouclier" className="h-5 w-5 text-accent" /> Modération de la messagerie</h2>
          <button onClick={onFermer} aria-label="Fermer"><Icon name="croix" className="h-5 w-5 text-muted" /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4 text-[13px]">
          <section>
            <h3 className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-muted">Utilisateurs bloqués</h3>
            {j?.bloques.length ? (
              <ul className="space-y-1">
                {j.bloques.map((b) => (
                  <li key={b.cle} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
                    <Avatar p={b} taille="sm" />
                    <span className="flex-1">{b.libelle} <PastilleProfil type={b.type} /> {b.motif && <span className="text-muted">— {b.motif}</span>}</span>
                    <button className={bouton} onClick={() => void onDebloquer(b.cle).then(charger)}>Débloquer</button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">Personne n’est bloqué.</p>
            )}
          </section>
          <section>
            <h3 className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-muted">Journal</h3>
            <table className="w-full text-[12.5px]">
              <tbody>
                {(j?.journal ?? []).map((l, i) => (
                  <tr key={i} className="border-b border-border/60 align-top">
                    <td className="whitespace-nowrap py-1 pr-2 text-muted">{new Date(l.quand).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="py-1 pr-2 font-medium">{l.auteur}</td>
                    <td className="py-1 pr-2">{l.action}{l.cible ? ` · ${l.cible}` : ""}{l.conversation ? <span className="text-muted"> ({l.conversation})</span> : null}</td>
                    <td className="py-1 text-muted">{l.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {j && !j.journal.length && <p className="text-muted">Aucune action pour l’instant.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
