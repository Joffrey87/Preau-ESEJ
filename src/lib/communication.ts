// Messagerie « Communication » : boîtes (une par famille, une par service de l'école), fils de discussion (à deux ou en
// groupe), messages et pièces jointes. Tout passe par les fonctions com_* de la base, qui vérifient que le compte
// connecté tient la boîte utilisée ; les fichiers vont dans le bucket privé « messagerie ».

import type { SupabaseClient } from "@supabase/supabase-js";

export type Boite = { id: string; libelle: string; service: string | null; non_lus: number };
export type Destinataire = { id: string; libelle: string; service: string | null };
export type Fil = {
  id: string;
  sujet: string;
  participants: string | null;
  nb_participants: number;
  dernier_le: string;
  apercu: string | null;
  non_lu: boolean;
  signale: boolean;
  entre_familles: boolean;
  cree_par_moi: boolean;
  envoi_groupe: boolean;
};
export type PieceJointe = { path: string; nom: string; type: string; taille: number };
export type MessageCom = { id: string; auteur: string; de_moi: boolean; texte: string | null; pj: PieceJointe[]; masque: boolean; created_at: string };
export type Participant = { id: string; libelle: string; service: string | null; moi: boolean };

/** Après une lecture ou un envoi : la pastille du menu se met à jour. */
export const EVT_COM = "com:maj";
export const signalerMaj = () => window.dispatchEvent(new Event(EVT_COM));
/** Signal temps réel reçu (un fil a bougé) : relayé par la pastille du menu, seule abonnée, vers la page ouverte. */
export const EVT_SIGNAL = "com:signal";

export const BUCKET = "messagerie";
export const TAILLE_MAX = 10 * 1024 * 1024;
export const TYPES_ACCEPTES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const lever = <T,>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

export const chargerBoites = async (sb: SupabaseClient) => lever<Boite[]>(await sb.rpc("com_boites_moi")) ?? [];
export const chargerAnnuaire = async (sb: SupabaseClient) => lever<Destinataire[]>(await sb.rpc("com_annuaire")) ?? [];
export const chargerClasses = async (sb: SupabaseClient) => lever<{ id: string; nom: string }[]>(await sb.rpc("com_classes")) ?? [];
export const chargerFils = async (sb: SupabaseClient, boite: string) => lever<Fil[]>(await sb.rpc("com_fils_de", { p_boite: boite })) ?? [];
export const chargerMessages = async (sb: SupabaseClient, fil: string, boite: string) =>
  lever<MessageCom[]>(await sb.rpc("com_messages_de", { p_fil: fil, p_boite: boite })) ?? [];
export const chargerParticipants = async (sb: SupabaseClient, fil: string, boite: string) =>
  lever<Participant[]>(await sb.rpc("com_participants_de", { p_fil: fil, p_boite: boite })) ?? [];

/** Contrôle d'un fichier avant dépôt ; renvoie le motif du refus, sinon null. */
export function refusFichier(f: File): string | null {
  if (f.size > TAILLE_MAX) return `« ${f.name} » dépasse 10 Mo.`;
  if (!TYPES_ACCEPTES.includes(f.type)) return `« ${f.name} » : format non accepté (images, PDF, Word, Excel).`;
  return null;
}

/** Dépose les fichiers dans le dossier de la boîte qui envoie ; renvoie les pièces jointes à citer dans le message. */
export async function deposer(sb: SupabaseClient, boite: string, fichiers: File[]): Promise<PieceJointe[]> {
  const pj: PieceJointe[] = [];
  for (const f of fichiers) {
    const nom = f.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").slice(-80) || "fichier";
    const path = `${boite}/${crypto.randomUUID()}/${nom}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type, upsert: false });
    if (error) throw new Error(`Envoi de « ${f.name} » impossible : ${error.message}`);
    pj.push({ path, nom: f.name, type: f.type, taille: f.size });
  }
  return pj;
}

/** Lien temporaire (5 min) vers une pièce jointe. */
export async function lienPj(sb: SupabaseClient, path: string, telecharger?: string) {
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 300, telecharger ? { download: telecharger } : undefined);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export const tailleLisible = (o: number) => (o < 1024 * 1024 ? `${Math.max(1, Math.round(o / 1024))} Ko` : `${(o / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`);

/** « 14:32 » aujourd'hui, « 12 oct. » cette année, sinon « 12/10/2025 ». */
export function quand(iso: string, maintenant = new Date()) {
  const d = new Date(iso);
  if (d.toDateString() === maintenant.toDateString()) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (d.getFullYear() === maintenant.getFullYear()) return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return d.toLocaleDateString("fr-FR");
}
