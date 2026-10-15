"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";

// Bascule réelle du Webmestre (voir src/lib/basculeReelle.ts) : bandeau permanent, choix du compte à ouvrir (depuis le
// bandeau ou le logo) et ouverture par mot de passe (depuis le panneau Webmestre du logo).

/** Le logo (ou le panneau Webmestre) demande l'ouverture du choix des comptes. */
export const EVENEMENT_BASCULE_REELLE = "preau:bascule-reelle";
const A_OUVRIR = "preau.bascule-reelle.ouvrir";

export const ouvrirChoixBasculeReelle = () => window.dispatchEvent(new Event(EVENEMENT_BASCULE_REELLE));

/** À la déconnexion : le jeton de bascule est révoqué (sans effet s'il n'y en a pas). */
export async function finirBasculeReelle() {
  try {
    await fetch("/bascule-webmestre", { method: "DELETE" });
  } catch {}
}

type Cible = { userId: string; prenom?: string; libelle: string; groupe: string };
const GROUPES = ["Bureau", "Recherche de fonds", "Professeurs", "Événementiel", "Familles"];

async function poster(corps: Record<string, string>): Promise<{ ok: boolean; url?: string; raison?: string }> {
  try {
    const r = await fetch("/bascule-webmestre", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
    return (await r.json()) as { ok: boolean; url?: string; raison?: string };
  } catch {
    return { ok: false, raison: "Réseau indisponible" };
  }
}

const heure = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** Bandeau affiché sur toutes les pages tant que le jeton du Webmestre est valable. */
export function BandeauBasculeReelle({
  libelle,
  expire,
  surWebmestre,
  webmestreUser,
}: {
  libelle: string;
  expire: string;
  surWebmestre: boolean;
  webmestreUser: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const fermer = useCallback(() => setOuvert(false), []);

  useEffect(() => {
    const ouvre = () => setOuvert(true);
    window.addEventListener(EVENEMENT_BASCULE_REELLE, ouvre);
    try {
      if (sessionStorage.getItem(A_OUVRIR)) {
        sessionStorage.removeItem(A_OUVRIR);
        // Après le rechargement qui suit l'ouverture du jeton : le choix des comptes s'ouvre de lui-même.
        setTimeout(ouvre, 0);
      }
    } catch {}
    return () => window.removeEventListener(EVENEMENT_BASCULE_REELLE, ouvre);
  }, []);

  async function aller(corps: Record<string, string>) {
    setOccupe(true);
    setErreur(null);
    const r = await poster(corps);
    if (r.ok && r.url) return window.location.assign(r.url);
    setOccupe(false);
    setErreur(r.raison === "jeton" ? "La bascule a expiré : reconnectez-vous en Webmestre." : (r.raison ?? "Échec de la bascule."));
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-accent/40 bg-accent-soft px-5 py-2 text-[13px] md:px-8">
        <Icon name="bouclier" className="h-4 w-4 shrink-0 text-accent" />
        <span>
          {surWebmestre ? (
            <>Bascule réelle ouverte jusqu’à {heure(expire)}.</>
          ) : (
            <>
              Webmestre connecté en tant que <strong>{libelle}</strong> — session réelle : vos actions sont enregistrées sous ce compte
              (jusqu’à {heure(expire)}).
            </>
          )}
        </span>
        {erreur && <span className="text-negative">{erreur}</span>}
        <span className="ml-auto flex flex-wrap gap-x-4">
          <button type="button" onClick={() => setOuvert(true)} disabled={occupe} className="font-medium text-accent hover:underline">
            Changer de compte
          </button>
          {!surWebmestre && (
            <button type="button" onClick={() => aller({ action: "basculer", userId: webmestreUser })} disabled={occupe} className="font-medium text-accent hover:underline">
              Revenir au Webmestre
            </button>
          )}
          <button type="button" onClick={() => aller({ action: "terminer" })} disabled={occupe} className="font-medium text-muted hover:underline">
            Terminer la bascule
          </button>
        </span>
      </div>
      {ouvert && <ChoixCompte surWebmestre={surWebmestre} webmestreUser={webmestreUser} occupe={occupe} erreur={erreur} onFermer={fermer} onChoisir={aller} />}
    </>
  );
}

function ChoixCompte({
  surWebmestre,
  webmestreUser,
  occupe,
  erreur,
  onFermer,
  onChoisir,
}: {
  surWebmestre: boolean;
  webmestreUser: string;
  occupe: boolean;
  erreur: string | null;
  onFermer: () => void;
  onChoisir: (corps: Record<string, string>) => void;
}) {
  const [cibles, setCibles] = useState<Cible[] | null>(null);
  const [echec, setEchec] = useState<string | null>(null);
  const [filtre, setFiltre] = useState("");
  const champ = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/bascule-webmestre")
      .then((r) => r.json() as Promise<{ ok: boolean; cibles?: Cible[]; raison?: string }>)
      .then((d) => (d.ok ? setCibles(d.cibles ?? []) : setEchec(d.raison === "jeton" ? "La bascule a expiré." : "Liste indisponible.")))
      .catch(() => setEchec("Liste indisponible."));
    champ.current?.focus();
    const echap = (e: KeyboardEvent) => e.key === "Escape" && onFermer();
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [onFermer]);

  const groupes = useMemo(() => {
    const f = filtre
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const liste = (cibles ?? []).filter((c) => !f || norm(c.libelle).includes(f));
    return GROUPES.map((g) => ({ g, items: liste.filter((c) => c.groupe === g) })).filter((x) => x.items.length > 0);
  }, [cibles, filtre]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[10vh]" onMouseDown={(e) => e.target === e.currentTarget && onFermer()}>
      <div role="dialog" aria-label="Changer de compte" className="flex max-h-[75vh] w-full max-w-lg flex-col rounded-xl border border-border bg-surface shadow-xl">
        <div className="border-b border-border p-3">
          <div className="mb-2 flex items-center gap-2">
            <Icon name="bouclier" className="h-5 w-5 text-accent" />
            <h2 className="text-sm font-semibold">Ouvrir la session d’un compte</h2>
            <button type="button" onClick={onFermer} className="ml-auto text-xs text-muted hover:underline">
              Fermer
            </button>
          </div>
          <input
            ref={champ}
            value={filtre}
            onChange={(e) => setFiltre(e.target.value)}
            placeholder="Rechercher un profil, un professeur, une famille…"
            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          />
          {(erreur || echec) && <p className="mt-2 text-xs text-negative">{erreur ?? echec}</p>}
        </div>
        <div className="overflow-y-auto p-2">
          {!surWebmestre && (
            <button
              type="button"
              disabled={occupe}
              onClick={() => onChoisir({ action: "basculer", userId: webmestreUser })}
              className="mb-2 w-full rounded-lg border border-accent bg-accent-soft px-3 py-2 text-left text-[13px] font-medium text-accent hover:opacity-90"
            >
              Revenir à mon compte Webmestre
            </button>
          )}
          {cibles === null && !echec && <p className="px-2 py-3 text-xs text-muted">Chargement…</p>}
          {groupes.map(({ g, items }) => (
            <div key={g} className="mb-2">
              <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted">{g}</div>
              <ul className={g === "Familles" ? "" : "grid grid-cols-2 gap-1"}>
                {items.map((c) => (
                  <li key={`${c.userId}:${c.prenom ?? ""}`}>
                    <button
                      type="button"
                      disabled={occupe}
                      onClick={() => onChoisir({ action: "basculer", userId: c.userId, ...(c.prenom ? { prenom: c.prenom } : {}) })}
                      className="w-full rounded-md px-2 py-1 text-left text-[13px] hover:bg-surface-2 disabled:opacity-50"
                    >
                      {c.libelle}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {cibles && groupes.length === 0 && <p className="px-2 py-3 text-xs text-muted">Aucun compte ne correspond.</p>}
        </div>
      </div>
    </div>
  );
}

/** Panneau Webmestre du logo : ouvre la bascule réelle (mot de passe), ou le choix des comptes si elle est déjà ouverte. */
export function OuvrirBasculeReelle({ active, onAction }: { active: boolean; onAction?: () => void }) {
  const [saisie, setSaisie] = useState(false);
  const [mdp, setMdp] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  if (active)
    return (
      <button
        type="button"
        onClick={() => {
          onAction?.();
          ouvrirChoixBasculeReelle();
        }}
        className="mb-2 flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-[13px] font-medium hover:bg-surface-2"
      >
        <Icon name="users" className="h-5 w-5" />
        Ouvrir un autre compte…
      </button>
    );

  if (!saisie)
    return (
      <button
        type="button"
        onClick={() => setSaisie(true)}
        className="mb-2 flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-[13px] font-medium hover:bg-surface-2"
      >
        <Icon name="users" className="h-5 w-5" />
        Bascule réelle sur un compte…
      </button>
    );

  return (
    <form
      className="mb-2 rounded-lg border border-border p-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setOccupe(true);
        setErreur(null);
        const r = await poster({ action: "ouvrir", motDePasse: mdp });
        setMdp("");
        if (r.ok) {
          try {
            sessionStorage.setItem(A_OUVRIR, "1");
          } catch {}
          return window.location.reload();
        }
        setOccupe(false);
        setErreur(r.raison === "indisponible" ? "Clé de service absente sur ce serveur." : (r.raison ?? "Échec."));
      }}
    >
      <label htmlFor="mdp-webmestre" className="mb-1 block text-[11px] text-muted">
        Confirmez votre mot de passe Webmestre (valable 4 h, journalisé)
      </label>
      <input
        id="mdp-webmestre"
        type="password"
        autoComplete="current-password"
        autoFocus
        value={mdp}
        onChange={(e) => setMdp(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
      />
      {erreur && <p className="mt-1 text-xs text-negative">{erreur}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={() => setSaisie(false)} className="text-xs text-muted hover:underline">
          Annuler
        </button>
        <button type="submit" disabled={occupe || !mdp} className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-fg disabled:opacity-50">
          Ouvrir
        </button>
      </div>
    </form>
  );
}
