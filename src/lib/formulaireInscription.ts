// Formulaires d'inscription modifiables par la Directrice (15/10/2026) : une base commune de sections et de champs,
// chacun pouvant ne concerner que la préinscription ou la réinscription. Brouillon prévisualisé, puis publié.
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLASSES_DEMANDEES } from "./inscriptions";

export type TypeFormulaire = "pre" | "re";
export type Pour = "tous" | TypeFormulaire;
export type TypeChamp = "texte" | "texte_long" | "date" | "courriel" | "tel" | "choix" | "case" | "fichier" | "photo";

export type Champ = {
  /** Clé de la réponse dans le dossier : fixée à la création, elle ne change plus (les anciens dossiers restent lisibles). */
  cle: string;
  libelle: string;
  type: TypeChamp;
  obligatoire: boolean;
  aide?: string;
  /** Liste de choix (type « choix »). */
  options?: string[];
  pour: Pour;
  /** Champ attendu par la base (nom de l'enfant, contact du parent 1) : ni supprimable, ni facultatif. */
  socle?: boolean;
};
export type Section = { id: string; titre: string; pour: Pour; champs: Champ[] };
export type TextesFormulaire = { intro: string; merci: string };
export type ConfigFormulaire = { textes: Record<TypeFormulaire, TextesFormulaire>; sections: Section[] };

export const TYPES_CHAMP: { v: TypeChamp; label: string }[] = [
  { v: "texte", label: "Texte court" },
  { v: "texte_long", label: "Texte long" },
  { v: "date", label: "Date" },
  { v: "courriel", label: "Courriel" },
  { v: "tel", label: "Téléphone" },
  { v: "choix", label: "Liste de choix" },
  { v: "case", label: "Case à cocher" },
  { v: "fichier", label: "Pièce jointe (image ou PDF)" },
  { v: "photo", label: "Photo de l'enfant" },
];
export const LIBELLES_POUR: Record<Pour, string> = { tous: "Les deux", pre: "Préinscription seulement", re: "Réinscription seulement" };
export const TITRES_FORMULAIRE: Record<TypeFormulaire, string> = { pre: "Préinscription", re: "Réinscription" };

const c = (cle: string, libelle: string, type: TypeChamp, plus: Partial<Champ> = {}): Champ => ({ cle, libelle, type, obligatoire: false, pour: "tous", ...plus });
const parent = (k: 1 | 2): Section => ({
  id: `parent${k}`,
  titre: `Parent ${k}`,
  pour: "tous",
  champs: [
    c(`parent${k}_prenom`, "Prénom", "texte"),
    c(`parent${k}_nom`, "Nom", "texte"),
    c(`parent${k}_telephone`, "Téléphone", "tel", k === 1 ? { socle: true } : {}),
    c(`parent${k}_courriel`, "Courriel", "courriel", k === 1 ? { socle: true } : {}),
  ],
});

/** Formulaire d'origine (avant toute modification de la Directrice). */
export const FORMULAIRE_DEFAUT: ConfigFormulaire = {
  textes: {
    pre: {
      intro: "Remplissez ce dossier pour demander l'inscription de votre enfant. La Directrice étudie chaque demande et vous recontacte.",
      merci: "Merci, votre demande de préinscription est bien reçue. La Directrice l'étudie et reviendra vers vous.",
    },
    re: {
      intro: "Choisissez un enfant, vérifiez les informations pré-remplies, puis envoyez le dossier à la Directrice.",
      merci: "Merci, le dossier de réinscription est bien envoyé à la Directrice.",
    },
  },
  sections: [
    {
      id: "enfant",
      titre: "L'enfant",
      pour: "tous",
      champs: [
        c("enfant_prenom", "Prénom", "texte", { obligatoire: true, socle: true }),
        c("enfant_nom", "Nom", "texte", { obligatoire: true, socle: true }),
        c("date_naissance", "Date de naissance", "date"),
        c("lieu_naissance", "Lieu de naissance", "texte"),
        c("classe_demandee", "Classe demandée", "choix", { options: CLASSES_DEMANDEES }),
        c("ecole_actuelle", "École actuelle", "texte"),
        c("photo", "Photo de l'enfant", "photo"),
      ],
    },
    parent(1),
    parent(2),
    {
      id: "adresse",
      titre: "Adresse postale",
      pour: "tous",
      champs: [c("adresse", "Adresse", "texte"), c("cp_ville", "Code postal et ville", "texte"), c("remarques", "Remarques (santé, fratrie, questions…)", "texte_long")],
    },
  ],
};

export const concerne = (pour: Pour, type: TypeFormulaire) => pour === "tous" || pour === type;

/** Sections et champs visibles pour un type de dossier. */
export function sectionsPour(config: ConfigFormulaire, type: TypeFormulaire): Section[] {
  return config.sections
    .filter((s) => concerne(s.pour, type))
    .map((s) => ({ ...s, champs: s.champs.filter((ch) => concerne(ch.pour, type)) }))
    .filter((s) => s.champs.length > 0);
}

/** Champ pleine largeur (les autres vont par deux). */
export const pleineLargeur = (t: TypeChamp) => t === "texte_long" || t === "case" || t === "fichier" || t === "photo";

export function nouvelleCle(libelle: string, existantes: Set<string>): string {
  const base =
    libelle
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 30) || "champ";
  let cle = base;
  for (let i = 2; existantes.has(cle); i++) cle = `${base}_${i}`;
  return cle;
}

export const toutesLesCles = (config: ConfigFormulaire) => new Set(config.sections.flatMap((s) => s.champs.map((ch) => ch.cle)));

/** Configuration lue en base ; la version d'origine si rien n'a encore été enregistré. */
export async function chargerFormulaire(sb: SupabaseClient, etat: "brouillon" | "publie"): Promise<{ config: ConfigFormulaire; modifieLe: string | null; publieLe: string | null }> {
  const { data } = await sb.from("inscriptions_formulaires").select("etat, config, modifie_le, publie_le").in("etat", etat === "brouillon" ? ["brouillon", "publie"] : ["publie"]);
  const lignes = (data ?? []) as { etat: string; config: ConfigFormulaire; modifie_le: string; publie_le: string | null }[];
  const l = lignes.find((x) => x.etat === etat) ?? lignes.find((x) => x.etat === "publie");
  return { config: l?.config ?? FORMULAIRE_DEFAUT, modifieLe: l?.modifie_le ?? null, publieLe: lignes.find((x) => x.etat === "publie")?.publie_le ?? null };
}
