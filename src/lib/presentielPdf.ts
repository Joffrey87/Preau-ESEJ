// Taux de présentiel de fin d'année : un PDF pour toute l'école, une section par classe (document à archiver).
// Seules comptent les demi-journées où l'appel a été fait (cf. `presentiel`).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Absence, Appel } from "@/lib/absences";
import { nomEleve, type Classe, type EleveBulletin } from "@/lib/bulletins";
import { bornesAnnee, presentiel, tauxTexte } from "@/lib/calendrier";
import { creerPlume, telechargerPdf, M, W } from "@/lib/documentPdf";

export async function telechargerPresentielPdf(sb: SupabaseClient, annee: string) {
  const { debut, fin } = bornesAnnee(annee);
  const [c, el] = await Promise.all([
    sb.from("classes").select("*").eq("annee_scolaire", annee).order("ordre"),
    sb.rpc("eleves_bulletins", { p_annee: annee }),
  ]);
  const classes = (c.data ?? []) as Classe[];
  if (!classes.length) throw new Error(`Aucune classe en ${annee}.`);
  const eleves = new Map(((el.data ?? []) as EleveBulletin[]).map((e) => [e.id, e]));
  const [ce, ap] = await Promise.all([
    sb.from("classe_eleves").select("classe_id, eleve_id").in("classe_id", classes.map((x) => x.id)),
    sb.from("appels").select("classe_id, date, demi_journee").in("classe_id", classes.map((x) => x.id)).gte("date", debut).lte("date", fin),
  ]);
  const membres = (ce.data ?? []) as { classe_id: string; eleve_id: string }[];
  const appels = (ap.data ?? []) as Pick<Appel, "classe_id" | "date" | "demi_journee">[];
  const ids = [...new Set(membres.map((m) => m.eleve_id))];
  const absences: Absence[] = [];
  // Par paquets : la liste d'identifiants passe dans l'adresse de la requête.
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await sb.from("absences").select("*").in("eleve_id", ids.slice(i, i + 150)).gte("date", debut).lte("date", fin);
    if (error) throw new Error(error.message);
    absences.push(...((data ?? []) as Absence[]));
  }

  const p = await creerPlume();
  const { NAVY, OR_DOUX, GRIS, BLANC } = p.c;
  p.entete(`Taux de présentiel · Année ${annee}`, `Édité le ${new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`);
  p.texte("Seules comptent les demi-journées où l'appel a été fait. Un retard compte comme une présence.", M, p.top, p.italic, 8.5, GRIS);
  p.top += 14;

  const cols = { nom: M + 6, appel: M + 230, abs: M + 300, just: M + 360, ret: M + 420, taux: M + 478 };
  const entete = () => {
    p.rect(M, p.top, W - 2 * M, 18, NAVY);
    p.texte("Élève", cols.nom, p.top + 12, p.semi, 8, BLANC);
    p.centre("1/2 j. d'appel", cols.appel + 20, p.top + 12, p.semi, 7.5, BLANC);
    p.centre("Absences", cols.abs + 20, p.top + 12, p.semi, 7.5, BLANC);
    p.centre("Justifiées", cols.just + 20, p.top + 12, p.semi, 7.5, BLANC);
    p.centre("Retards", cols.ret + 20, p.top + 12, p.semi, 7.5, BLANC);
    p.centre("Présentiel", cols.taux + 24, p.top + 12, p.semi, 7.5, BLANC);
    p.top += 18;
  };

  for (const classe of classes) {
    const siens = membres
      .filter((m) => m.classe_id === classe.id)
      .map((m) => eleves.get(m.eleve_id))
      .filter((e): e is EleveBulletin => !!e)
      .sort((a, b) => nomEleve(a).localeCompare(nomEleve(b), "fr"));
    const appelsClasse = appels.filter((a) => a.classe_id === classe.id);
    p.place(40 + 18 + 16);
    p.top += 12;
    p.rect(M, p.top, W - 2 * M, 22, OR_DOUX);
    p.texte(`${classe.nom}${classe.niveaux.length ? ` (${classe.niveaux.join(" · ")})` : ""}`, M + 6, p.top + 15, p.semi, 10.5);
    const nbJ = new Set(appelsClasse.map((a) => a.date)).size;
    const info = `${appelsClasse.length} demi-journées d'appel sur ${nbJ} jour${nbJ > 1 ? "s" : ""}`;
    p.texte(info, W - M - 6 - p.largeur(info, p.regular, 8), p.top + 15, p.regular, 8, GRIS);
    p.top += 22;
    entete();
    if (!siens.length) {
      p.texte("Aucun élève.", cols.nom, p.top + 12, p.italic, 8.5, GRIS);
      p.top += 18;
    }
    for (const e of siens) {
      if (p.place(16)) entete();
      const r = presentiel(appelsClasse, absences.filter((a) => a.eleve_id === e.id), e.sorti_le);
      p.texte(nomEleve(e) + (e.sorti_le ? ` (sorti le ${e.sorti_le.split("-").reverse().join("/")})` : ""), cols.nom, p.top + 11, p.regular, 8.5);
      p.centre(String(r.demiJourneesAppel), cols.appel + 20, p.top + 11, p.regular, 8.5);
      p.centre(String(r.absences), cols.abs + 20, p.top + 11, p.regular, 8.5);
      p.centre(String(r.justifiees), cols.just + 20, p.top + 11, p.regular, 8.5, GRIS);
      p.centre(String(r.retards), cols.ret + 20, p.top + 11, p.regular, 8.5);
      p.centre(tauxTexte(r.taux), cols.taux + 24, p.top + 11, p.semi, 8.5);
      p.trait(p.top + 16);
      p.top += 16;
    }
  }
  p.place(50);
  p.top += 24;
  p.texte("La Directrice", W - M - 160, p.top, p.semi, 9);
  const octets = await p.terminer("ARIL · École du Saint-Enfant-Jésus — taux de présentiel édité avec Préau");
  telechargerPdf(octets, `Taux de présentiel ${annee}`);
}
