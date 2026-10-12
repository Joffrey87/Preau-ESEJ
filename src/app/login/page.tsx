"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { COOKIE_PRENOM, ROLES, ROLES_PRENOM_A_L_ACCES } from "@/lib/roles";
import { MEMBRES } from "@/lib/rechercheFonds";
import { emailConnexionFamille, identifiantFamille } from "@/lib/identifiantFamille";
import { memoriserSession } from "@/lib/basculeEspace";

const DERNIER_PRENOM = "recherche.dernierPrenom";
// Dernier onglet de connexion utilisé sur cet appareil (Famille par défaut).
const DERNIER_ESPACE = "connexion.dernierEspace";
const DERNIER_PROFESSEUR = "connexion.dernierProfesseur";
type Espace = "famille" | "professeurs" | "bureau";
const dernierProfesseur = () => {
  try {
    return localStorage.getItem(DERNIER_PROFESSEUR) ?? "";
  } catch {
    return "";
  }
};
const ONGLETS: { v: Espace; label: string }[] = [
  { v: "famille", label: "Famille" },
  { v: "professeurs", label: "Professeurs" },
  { v: "bureau", label: "Administration" },
];

export default function LoginPage() {
  const router = useRouter();
  // Bureau : un compte par rôle, choisi dans la liste. Famille : son adresse.
  const [espace, setEspace] = useState<Espace>("famille");
  // Professeurs : un compte nominatif chacun, choisi dans la liste (liste fournie par la base, sans session).
  const [professeurs, setProfesseurs] = useState<{ libelle: string; email: string }[]>([]);
  useEffect(() => {
    createClient()
      .rpc("professeurs_connexion")
      .then(({ data }) => setProfesseurs((data ?? []) as { libelle: string; email: string }[]));
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
      const e = localStorage.getItem(DERNIER_ESPACE) as Espace | null;
      if (e === "bureau" || e === "professeurs") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEspace(e);
        // Administration : le Trésorier par défaut ; Professeurs : le dernier professeur connecté ici.
        setEmail(e === "bureau" ? ROLES[1].email : dernierProfesseur());
      }
    } catch {}
    try {
      const p = localStorage.getItem(DERNIER_PRENOM);
      if (p && MEMBRES.includes(p)) setPrenom(p);
    } catch {}
  }, []);
  const avecPrenom = espace === "bureau" && ROLES_PRENOM_A_L_ACCES.includes(ROLES.find((r) => r.email === email)?.slug ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Arrivée depuis le logo (changement d'espace) : l'espace voulu est présélectionné.
  const [depuisBascule, setDepuisBascule] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const voulu = q.get("espace");
    if (voulu === "famille") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEspace("famille");
      setEmail("");
      setNomFamille(q.get("nom") ?? "");
      setDepuisBascule(true);
    } else if (voulu === "recherche") {
      setEspace("bureau");
      setEmail(ROLES.find((r) => r.slug === "recherche-fonds")?.email ?? ROLES[1].email);
      const p = q.get("prenom");
      if (p && MEMBRES.includes(p)) setPrenom(p);
      setDepuisBascule(true);
    }
  }, []);

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
            : "Rôle ou mot de passe incorrect.",
      );
      setLoading(false);
      return;
    }

    try {
      localStorage.setItem(DERNIER_ESPACE, espace);
      if (espace === "professeurs") localStorage.setItem(DERNIER_PROFESSEUR, email);
      if (avecPrenom) localStorage.setItem(DERNIER_PRENOM, prenom);
    } catch {}
    // Session gardée pour le va-et-vient Espace famille ↔ Recherche de fonds (logo en haut à gauche).
    if (espace === "famille") await memoriserSession("famille");
    else if (avecPrenom) await memoriserSession("recherche");

    // Prénom de la visite : cookie de session (sans durée), effacé à la fermeture du navigateur.
    document.cookie = avecPrenom
      ? `${COOKIE_PRENOM}=${encodeURIComponent(prenom)}; path=/; SameSite=Lax`
      : `${COOKIE_PRENOM}=; path=/; max-age=0; SameSite=Lax`;

    // Le middleware oriente chaque compte vers son espace.
    router.push(espace === "famille" ? "/espace" : "/");
    router.refresh();
  }

  return (
    <div className="grid min-h-screen place-items-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.webp"
            alt="Préau"
            className="mb-4 h-44 w-44 rounded-full object-contain"
          />
          <h1 className="text-xl font-semibold">Préau</h1>
          <p className="mt-1 text-sm text-muted">
            ARIL · École du Saint-Enfant-Jésus
          </p>
        </div>

        {depuisBascule && (
          <p className="mb-3 rounded-lg bg-accent-soft px-3 py-2 text-center text-xs text-accent">
            Première ouverture de cet espace sur cet appareil : connectez-vous une fois, le passage de l&apos;un à l&apos;autre sera ensuite direct (logo en haut à gauche).
          </p>
        )}

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-border bg-surface p-6 shadow-sm"
        >
          <div className="mb-4 grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1 text-sm">
            {ONGLETS.map(({ v: e, label }) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  setEspace(e);
                  setEmail(e === "bureau" ? ROLES[1].email : e === "professeurs" ? dernierProfesseur() : "");
                  setError(null);
                }}
                className={`rounded-md px-2 py-1.5 font-medium ${espace === e ? "bg-surface shadow-sm" : "text-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {espace === "bureau" ? (
            <>
              <label className="mb-1 block text-sm font-medium" htmlFor="role">
                Rôle
              </label>
              <select
                id="role"
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
          ) : espace === "professeurs" ? (
            <>
              <label className="mb-1 block text-sm font-medium" htmlFor="professeur">
                Professeur
              </label>
              <select
                id="professeur"
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

        {espace === "famille" && (
          <div className="mt-4 space-y-3 text-center text-xs text-muted">
            <p>
              Un seul mot de passe par famille : <strong>le même pour Monsieur et pour Madame</strong>. L&apos;adresse électronique ne sert qu&apos;à la
              première connexion (lien pour choisir votre mot de passe) et à retrouver un mot de passe oublié.
            </p>
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
