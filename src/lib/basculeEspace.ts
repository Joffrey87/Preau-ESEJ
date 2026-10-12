// Aller-retour entre l'Espace famille, la Recherche de fonds et le profil Directrice pour une famille qui a plusieurs
// profils (ex. : la Directrice et son mari, membre de la Recherche de fonds).
//
// Les profils sont des comptes distincts. Après s'être connecté une fois à chacun sur cet appareil, la session de
// l'espace laissé de côté est gardée dans le navigateur (localStorage) : le logo bascule alors de l'un à l'autre sans
// ressaisir de mot de passe. Un espace jamais ouvert sur cet appareil renvoie à la connexion. La déconnexion efface tout.

import { createClient } from "@/lib/supabase/client";
import { COOKIE_PRENOM } from "@/lib/roles";

export type Espace = "famille" | "recherche" | "directrice";

/** Page d'arrivée de chaque espace. */
const ACCUEIL: Record<Espace, string> = { famille: "/espace", recherche: "/recherche/axes", directrice: "/bulletins" };

const CLE = "preau.sessions";
type Session = { access_token: string; refresh_token: string };
type Stock = Partial<Record<Espace, Session>>;

const lire = (): Stock => {
  try {
    return JSON.parse(localStorage.getItem(CLE) ?? "{}") as Stock;
  } catch {
    return {};
  }
};
const ecrire = (s: Stock) => {
  try {
    localStorage.setItem(CLE, JSON.stringify(s));
  } catch {}
};

/** Efface les sessions gardées (déconnexion volontaire). */
export function oublierSessions() {
  try {
    localStorage.removeItem(CLE);
  } catch {}
}

/** Garde la session en cours pour cet espace (à la connexion, et avant de le quitter). */
export async function memoriserSession(espace: Espace) {
  const { data } = await createClient().auth.getSession();
  const s = data.session;
  if (s) ecrire({ ...lire(), [espace]: { access_token: s.access_token, refresh_token: s.refresh_token } });
}

const cookiePrenom = (prenom: string | null) => {
  document.cookie = prenom
    ? `${COOKIE_PRENOM}=${encodeURIComponent(prenom)}; path=/; SameSite=Lax`
    : `${COOKIE_PRENOM}=; path=/; max-age=0; SameSite=Lax`;
};

/**
 * Passe de l'espace `quitte` à l'espace `vers`. `prenom` : prénom du membre Recherche de fonds (pour aller vers la
 * Recherche de fonds) ; `famille` : nom de la famille (pour préremplir la connexion quand l'espace n'a pas encore été
 * ouvert ici).
 */
export async function basculerVers(vers: Espace, quitte: Espace, infos: { prenom?: string | null; famille?: string | null }) {
  const supabase = createClient();
  await memoriserSession(quitte);

  const session = lire()[vers];
  if (session) {
    const { data, error } = await supabase.auth.setSession(session);
    if (!error && data.session) {
      ecrire({ ...lire(), [vers]: { access_token: data.session.access_token, refresh_token: data.session.refresh_token } });
      cookiePrenom(vers === "recherche" ? (infos.prenom ?? null) : null);
      window.location.assign(ACCUEIL[vers]);
      return;
    }
    // Session expirée ou révoquée : on la retire et on repasse par la connexion.
    const s = lire();
    delete s[vers];
    ecrire(s);
  }

  // Première ouverture de cet espace sur l'appareil : connexion (l'espace quitté reste gardé, la session locale est fermée).
  await supabase.auth.signOut({ scope: "local" });
  cookiePrenom(null);
  const q = new URLSearchParams(
    vers === "famille"
      ? { espace: "famille", ...(infos.famille ? { nom: infos.famille } : {}) }
      : vers === "directrice"
        ? { espace: "directrice" }
        : { espace: "recherche", ...(infos.prenom ? { prenom: infos.prenom } : {}) },
  );
  window.location.assign(`/login?${q.toString()}`);
}
