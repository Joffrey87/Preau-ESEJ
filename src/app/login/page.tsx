"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { COOKIE_PRENOM, ROLES, ROLES_PRENOM_A_L_ACCES } from "@/lib/roles";
import { MEMBRES } from "@/lib/rechercheFonds";
import { emailConnexionFamille, identifiantFamille } from "@/lib/identifiantFamille";
import { memoriserSession } from "@/lib/basculeEspace";
import Icon from "@/components/Icon";

const DERNIER_PRENOM = "recherche.dernierPrenom";
const DERNIER_PROFESSEUR = "connexion.dernierProfesseur";
type Espace = "famille" | "professeurs" | "bureau" | "evenement";
const DERNIER_EVENEMENT = "connexion.dernierEvenement";
const dernierChoix = (cle: string) => {
  try {
    return localStorage.getItem(cle) ?? "";
  } catch {
    return "";
  }
};
// Accueil : trois grands boutons ; la boîte de connexion de l'espace choisi s'ouvre en dessous.
const ESPACES: { v: Espace; label: string; icone: string }[] = [
  { v: "famille", label: "Famille", icone: "maison" },
  { v: "professeurs", label: "Professeur", icone: "graduation" },
  { v: "bureau", label: "Administration", icone: "ledger" },
  { v: "evenement", label: "Événement", icone: "calendar" },
];

export default function LoginPage() {
  const router = useRouter();
  // Bureau : un compte par rôle, choisi dans la liste. Famille : son adresse.
  const [espace, setEspace] = useState<Espace | null>(null);
  // Professeurs : un compte nominatif chacun, choisi dans la liste (liste fournie par la base, sans session).
  const [professeurs, setProfesseurs] = useState<{ libelle: string; email: string }[]>([]);
  useEffect(() => {
    createClient()
      .rpc("professeurs_connexion")
      .then(({ data }) => setProfesseurs((data ?? []) as { libelle: string; email: string }[]));
  }, []);
  // Événement : comptes simples (identifiant et mot de passe = prénom), liste fournie par la base.
  const [membresEvenement, setMembresEvenement] = useState<{ libelle: string; email: string }[]>([]);
  useEffect(() => {
    createClient()
      .rpc("evenement_connexion")
      .then(({ data }) => setMembresEvenement((data ?? []) as { libelle: string; email: string }[]));
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Famille : le nom de famille sert d'identifiant (« Mot de passe oublié » : nom + une adresse connue de l'école).
  const [nomFamille, setNomFamille] = useState("");
  const [oubli, setOubli] = useState(false);
  const [courrielOubli, setCourrielOubli] = useState("");
  const [infoOubli, setInfoOubli] = useState<string | null>(null);
  // Profil partagé (Recherche de fonds) : chacun indique son prénom à l'accès.
  const [prenom, setPrenom] = useState("");
  // Le dernier prénom utilisé sur cet appareil est proposé d'office.
  useEffect(() => {
    try {
      const p = localStorage.getItem(DERNIER_PRENOM);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (p && MEMBRES.includes(p)) setPrenom(p);
    } catch {}
  }, []);
  const avecPrenom = espace === "bureau" && ROLES_PRENOM_A_L_ACCES.includes(ROLES.find((r) => r.email === email)?.slug ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Arrivée depuis le logo (changement d'espace) : l'espace voulu est présélectionné.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const voulu = q.get("espace");
    if (voulu === "famille") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEspace("famille");
      setEmail("");
      setNomFamille(q.get("nom") ?? "");
    } else if (voulu === "directrice" || voulu === "president") {
      setEspace("bureau");
      setEmail(ROLES.find((r) => r.slug === voulu)?.email ?? ROLES[1].email);
    } else if (voulu === "recherche") {
      setEspace("bureau");
      setEmail(ROLES.find((r) => r.slug === "recherche-fonds")?.email ?? ROLES[1].email);
      const p = q.get("prenom");
      if (p && MEMBRES.includes(p)) setPrenom(p);
    }
  }, []);

  /** Ouvre (ou referme) la boîte de connexion d'un espace. Administration : le Trésorier par défaut ;
   *  Professeurs : le dernier professeur connecté sur cet appareil. */
  function choisirEspace(e: Espace) {
    setError(null);
    if (espace === e) return setEspace(null);
    setEspace(e);
    setEmail(
      e === "bureau" ? ROLES[1].email : e === "professeurs" ? dernierChoix(DERNIER_PROFESSEUR) : e === "evenement" ? dernierChoix(DERNIER_EVENEMENT) : "",
    );
  }

  /** « Mot de passe oublié » : demande enregistrée pour le bureau (réponse toujours identique, rien n'est divulgué). */
  async function demanderReinitialisation(e: React.FormEvent) {
    e.preventDefault();
    setInfoOubli(null);
    setLoading(true);
    await createClient().rpc("demander_raz_famille", { p_nom: nomFamille, p_courriel: courrielOubli });
    setLoading(false);
    setInfoOubli(
      "Votre demande est enregistrée. Si ce nom de famille et cette adresse sont connus de l'école, un nouveau lien pour choisir votre mot de passe vous sera transmis.",
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (avecPrenom && !prenom) return setError("Choisissez votre prénom.");
    setLoading(true);

    const supabase = createClient();
    if (espace === "famille" && !identifiantFamille(nomFamille)) {
      setLoading(false);
      return setError("Indiquez votre nom de famille.");
    }
    const adresse = espace === "famille" ? emailConnexionFamille(nomFamille) : email;
    let { error } = await supabase.auth.signInWithPassword({ email: adresse, password });
    // Profils du bureau : le mot de passe est tolérant aux accents et aux majuscules (« Président » = « president »).
    if (error && espace !== "famille") {
      const souple = password.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
      if (souple && souple !== password) ({ error } = await supabase.auth.signInWithPassword({ email: adresse, password: souple }));
    }

    if (error) {
      setError(
        espace === "famille"
          ? "Nom de famille ou mot de passe incorrect."
          : espace === "professeurs"
            ? "Professeur ou mot de passe incorrect."
            : espace === "evenement"
              ? "Prénom ou mot de passe incorrect."
            : "Rôle ou mot de passe incorrect.",
      );
      setLoading(false);
      return;
    }

    try {
      if (espace === "professeurs") localStorage.setItem(DERNIER_PROFESSEUR, email);
      if (espace === "evenement") localStorage.setItem(DERNIER_EVENEMENT, email);
      if (avecPrenom) localStorage.setItem(DERNIER_PRENOM, prenom);
    } catch {}
    // Session gardée pour le va-et-vient Espace famille ↔ Recherche de fonds (logo en haut à gauche).
    if (espace === "famille") await memoriserSession("famille");
    else if (avecPrenom) await memoriserSession("recherche");
    else if (adresse === ROLES.find((r) => r.slug === "directrice")?.email) await memoriserSession("directrice");
    else if (adresse === ROLES.find((r) => r.slug === "president")?.email) await memoriserSession("president");

    // Prénom de la visite : cookie de session (sans durée), effacé à la fermeture du navigateur.
    document.cookie = avecPrenom
      ? `${COOKIE_PRENOM}=${encodeURIComponent(prenom)}; path=/; SameSite=Lax`
      : `${COOKIE_PRENOM}=; path=/; max-age=0; SameSite=Lax`;

    // Le middleware oriente chaque compte vers son espace.
    router.push(espace === "famille" ? "/espace" : espace === "evenement" ? "/evenement" : "/");
    router.refresh();
  }

  return (
    <div className="grid min-h-screen place-items-center px-5 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.webp"
            alt="Préau"
            className="mb-4 h-44 w-44 rounded-full object-contain"
          />
          <h1 className="sr-only">Préau</h1>
          <p className="text-sm text-muted">
            ARIL · École du Saint-Enfant-Jésus
          </p>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ESPACES.map(({ v, label, icone }) => (
            <button
              key={v}
              type="button"
              onClick={() => choisirEspace(v)}
              aria-pressed={espace === v}
              className={`flex flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-5 text-sm font-medium shadow-sm transition-colors ${
                espace === v ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface hover:border-accent/60 hover:bg-surface-2"
              }`}
            >
              <Icon name={icone} className="h-9 w-9" />
              {label}
            </button>
          ))}
        </div>

        {espace && (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-border bg-surface p-6 shadow-sm"
          >
            {espace === "bureau" ? (
              <>
                <label className="mb-1 block text-sm font-medium" htmlFor="role">
                  Rôle
                </label>
                <select
                  id="role"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mb-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  {ROLES.map((r) => (
                    <option key={r.slug} value={r.email}>
                      {r.label}
                    </option>
                  ))}
                </select>
                {avecPrenom && (
                  <>
                    <label className="mb-1 block text-sm font-medium" htmlFor="prenom">
                      Prénom
                    </label>
                    <select
                      id="prenom"
                      required
                      value={prenom}
                      onChange={(e) => setPrenom(e.target.value)}
                      className="mb-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                    >
                      <option value="">— Choisir —</option>
                      {MEMBRES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </>
            ) : espace === "evenement" ? (
              <>
                <label className="mb-1 block text-sm font-medium" htmlFor="membreEvenement">
                  Prénom
                </label>
                <select
                  id="membreEvenement"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mb-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  <option value="">— Choisir —</option>
                  {membresEvenement.map((m) => (
                    <option key={m.email} value={m.email}>
                      {m.libelle}
                    </option>
                  ))}
                </select>
              </>
            ) : espace === "professeurs" ? (
              <>
                <label className="mb-1 block text-sm font-medium" htmlFor="professeur">
                  Professeur
                </label>
                <select
                  id="professeur"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mb-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  <option value="">— Choisir —</option>
                  {professeurs.map((p) => (
                    <option key={p.email} value={p.email}>
                      {p.libelle}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <label className="mb-1 block text-sm font-medium" htmlFor="nomFamille">
                  Nom de famille
                </label>
                <input
                  id="nomFamille"
                  autoFocus
                  type="text"
                  autoComplete="username"
                  required
                  value={nomFamille}
                  onChange={(e) => setNomFamille(e.target.value)}
                  className="mb-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </>
            )}

            <label className="mb-1 block text-sm font-medium" htmlFor="password">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mb-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />

            {error && (
              <p className="mb-4 rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Accès…" : "Accéder"}
            </button>
          </form>
        )}

        {espace === "famille" && (
          <div className="mt-4 space-y-3 text-center text-xs text-muted">
            <button type="button" onClick={() => setOubli((o) => !o)} className="text-accent underline-offset-2 hover:underline">
              Mot de passe oublié ?
            </button>
            {oubli && (
              <form onSubmit={demanderReinitialisation} className="rounded-2xl border border-border bg-surface p-4 text-left shadow-sm">
                <p className="mb-2 text-xs">Indiquez votre nom de famille (ci-dessus) et l&apos;une des adresses électroniques données à l&apos;école.</p>
                <input
                  type="email"
                  required
                  value={courrielOubli}
                  onChange={(e) => setCourrielOubli(e.target.value)}
                  placeholder="Adresse électronique"
                  className="mb-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={loading || !identifiantFamille(nomFamille)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
                >
                  Demander un nouveau mot de passe
                </button>
                {infoOubli && <p className="mt-2 rounded-lg bg-positive/10 px-3 py-2 text-xs text-positive">{infoOubli}</p>}
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
