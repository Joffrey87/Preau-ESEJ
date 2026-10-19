import { NextResponse } from "next/server";
import { messageErreurLecture } from "@/lib/erreurLecture";
import { createClient } from "@/lib/supabase/server";
import { lireVentesAvecClaude } from "@/lib/lectureVentes";
import { MODELE_LECTURE } from "@/lib/lectureCaisse";
import { journaliserConso, nouveauSuivi } from "@/lib/consoClaude";

// Lecture automatique d'une liste de ventes (photo ou PDF). Réservé aux profils qui ont accès aux Ventes diverses
// (Trésorier, Directrice, Événementiel). Ni le fichier ni la clé ne sont journalisés.
export const runtime = "nodejs";
export const maxDuration = 60;

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
const TAILLE_MAX = 10 * 1024 * 1024;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return NextResponse.json({ erreur: "Session expirée : reconnectez-vous." }, { status: 401 });
  const { data: autorise } = await supabase.rpc("voit_ventes_diverses");
  if (autorise !== true) return NextResponse.json({ erreur: "Lecture réservée au Trésorier, à la Directrice et à l'Événementiel." }, { status: 403 });

  const cle = process.env.ANTHROPIC_API_KEY;
  if (!cle) return NextResponse.json({ erreur: "Lecture automatique non configurée (clé manquante sur le serveur)." }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const f = form?.get("fichier");
  if (!(f instanceof File)) return NextResponse.json({ erreur: "Aucun fichier reçu." }, { status: 400 });
  if (!TYPES.includes(f.type)) return NextResponse.json({ erreur: "Format non pris en charge (JPEG, PNG, WebP ou PDF)." }, { status: 415 });
  if (f.size > TAILLE_MAX) return NextResponse.json({ erreur: "Fichier trop lourd (10 Mo max)." }, { status: 413 });

  const suivi = nouveauSuivi(MODELE_LECTURE); // suivi du crédit Claude
  try {
    const b64 = Buffer.from(await f.arrayBuffer()).toString("base64");
    const lu = await lireVentesAvecClaude(cle, b64, f.type, suivi);
    await journaliserConso(supabase, "ventes", suivi, true);
    return NextResponse.json({ lignes: lu });
  } catch (e) {
    await journaliserConso(supabase, "ventes", suivi, false);
    const connue = messageErreurLecture(e);
    const msg = e instanceof Error ? e.message : "inconnu";
    console.error("lecture-ventes : échec", msg);
    if (connue) return NextResponse.json({ erreur: connue.erreur }, { status: connue.statut });
    return NextResponse.json(
      { erreur: "La lecture automatique a échoué. Saisissez à la main ou réessayez.", detail: msg.slice(0, 300) },
      { status: 502 },
    );
  }
}
