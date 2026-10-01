import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { pagesAutorisees } from "@/lib/roles";

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

  const isAuthRoute = request.nextUrl.pathname.startsWith("/login");
  // Page où une famille invitée choisit son mot de passe (lien reçu par courriel).
  const isMotDePasse = request.nextUrl.pathname.startsWith("/auth/mot-de-passe");
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

  // Profil restreint (ex. Recherche de fonds) : ses seules pages.
  const pages = user ? pagesAutorisees(user.email) : null;

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = estFamille ? "/espace" : (pages?.[0] ?? "/");
    return NextResponse.redirect(url);
  }

  if (pages) {
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
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|ttf)$).*)",
  ],
};
