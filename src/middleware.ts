import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_PRENOM, ROLES_PRENOM_A_L_ACCES, pageReserveeInterdite, estProfesseur, pagesAutorisees, roleByEmail } from "@/lib/roles";
import { PAGE_WEBMESTRE, niveauDuChemin, premierePage, type ContexteAcces } from "@/lib/acces";
import { COOKIE_VUE, emailEffectif } from "@/lib/vueRole";

// Rafraîchit la session et protège toutes les routes : sans session,
// on redirige vers /login (sauf la page /login elle-même).
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Démo publique du dépôt de chèques (données fictives, aucune écriture).
  if (request.nextUrl.pathname === "/cheques/demo") return response;
  const isAuthRoute = request.nextUrl.pathname.startsWith("/login");
  // Page où une famille invitée choisit son mot de passe (lien reçu par courriel).
  const isMotDePasse =
    request.nextUrl.pathname.startsWith("/auth/mot-de-passe") || request.nextUrl.pathname.startsWith("/auth/invitation");
  if (isMotDePasse) return response;

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Un compte famille n'accède qu'à son espace ; le bureau, jamais à celui-ci.
  // (La base le garantit aussi : un compte famille ne lit que sa famille.)
  const estFamille = (user?.app_metadata as { espace?: string } | undefined)?.espace === "famille";
  const versEspace = request.nextUrl.pathname.startsWith("/espace");

  // Profil Événement : uniquement /evenement (la base le garantit aussi : RLS). Côté bureau : Trésorier, Président et Directrice (lecture).
  const estEvenement = (user?.app_metadata as { espace?: string } | undefined)?.espace === "evenement";
  const versEvenement = request.nextUrl.pathname === "/evenement" || request.nextUrl.pathname.startsWith("/evenement/");
  // Famille reliée ouverte sans changer de compte (cookie sans droit propre : la base filtre).
  const enFamilleLiee = !!user && !estFamille && request.cookies.get("famille_liee")?.value === "1";
  const cheminLiee = request.nextUrl.pathname.startsWith("/famille-liee/");
  if (user && (cheminLiee || (enFamilleLiee && versEspace))) return response;
  // Bascule par le logo (la route vérifie elle-même le lien entre les comptes).
  if (user && request.nextUrl.pathname === "/bascule") return response;
  // Hors de l'Espace famille, le mode « famille reliée » se referme de lui-même.
  if (enFamilleLiee) response.cookies.delete("famille_liee");
  if (user && estEvenement && !versEvenement) {
    return NextResponse.redirect(Object.assign(request.nextUrl.clone(), { pathname: "/evenement", search: "" }));
  }
  if (user && estEvenement) return response;
  if (user && versEvenement && !["tresorier", "president", "directrice"].includes(roleByEmail(user.email)?.slug ?? "")) {
    return NextResponse.redirect(Object.assign(request.nextUrl.clone(), { pathname: "/", search: "" }));
  }

  // Profil partagé sans prénom choisi pour cette visite : la session est fermée
  // et l'on repasse par l'écran d'accueil.
  const sansPrenom =
    !!user &&
    ROLES_PRENOM_A_L_ACCES.includes(roleByEmail(user.email)?.slug ?? "") &&
    !request.cookies.get(COOKIE_PRENOM)?.value;
  if (sansPrenom) {
    const sortie = isAuthRoute
      ? NextResponse.next({ request })
      : NextResponse.redirect(Object.assign(request.nextUrl.clone(), { pathname: "/login", search: "" }));
    for (const c of request.cookies.getAll()) if (c.name.startsWith("sb-")) sortie.cookies.delete(c.name);
    return sortie;
  }

  // Vue « en tant que » (Trésorier) : les restrictions d'accès suivent le profil simulé.
  // Droits réglés par le Webmestre (tables acces_*) ; en cas d'erreur, les règles du code s'appliquent comme avant.
  let acces: ContexteAcces | null = null;
  if (user && !estFamille && !estProfesseur(user.email)) {
    const { data, error } = await supabase.rpc("acces_contexte", {
      p_vue: request.cookies.get(COOKIE_VUE)?.value ?? null,
      p_personne: decodeURIComponent(request.cookies.get(COOKIE_PRENOM)?.value ?? "") || null,
    });
    if (!error && data) acces = data as ContexteAcces;
  }
  const emailVue = emailEffectif(user?.email, request.cookies.get(COOKIE_VUE)?.value, acces?.webmestre);
  if (user && request.nextUrl.pathname.startsWith("/changer-profil")) return response;

  // Profil restreint (ex. Recherche de fonds) : ses seules pages.
  const pages = user ? pagesAutorisees(emailVue) : null;
  const chemin0 = request.nextUrl.pathname;
  const niveau = acces ? niveauDuChemin(acces.niveaux, chemin0) : null;
  const versWebmestre = chemin0 === PAGE_WEBMESTRE || chemin0.startsWith(PAGE_WEBMESTRE + "/");
  // Page du catalogue (ou page Webmestre) : la base décide ; sinon, règles du code.
  const parBase = !!user && !estFamille && (niveau !== null || versWebmestre);
  if (user && !estFamille && versWebmestre && !acces?.webmestre) {
    return NextResponse.redirect(Object.assign(request.nextUrl.clone(), { pathname: "/", search: "" }));
  }
  if (parBase && niveau === "masque" && acces && !isAuthRoute) {
    return NextResponse.redirect(Object.assign(request.nextUrl.clone(), { pathname: premierePage(acces.niveaux), search: "" }));
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = estFamille ? "/espace" : acces ? premierePage(acces.niveaux) : (pages?.[0] ?? "/");
    return NextResponse.redirect(url);
  }

  if (!parBase && user && !estFamille && pageReserveeInterdite(emailVue, request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (pages && !parBase) {
    const chemin = request.nextUrl.pathname;
    const autorise = pages.some((p) => chemin === p || chemin.startsWith(p + "/"));
    if (!autorise) {
      const url = request.nextUrl.clone();
      url.pathname = pages[0];
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  if (user && estFamille && !versEspace) {
    const url = request.nextUrl.clone();
    url.pathname = "/espace";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Le bureau n'entre dans l'espace famille qu'en aperçu (cookie posé par /apercu-famille/…).
  const enApercu = !!request.cookies.get("apercu_famille")?.value;
  if (user && !estFamille && versEspace && !enApercu) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|recu-sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|ttf)$).*)",
  ],
};
