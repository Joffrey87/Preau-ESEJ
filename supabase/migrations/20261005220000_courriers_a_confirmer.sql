-- 05/10/2026 — Page « Courriers à confirmer » (secrétaire) : reçus fiscaux envoyés par courrier postal.
--
-- Parcours d'un reçu à poster : À établir → À passer → « Passé au secrétaire » (vérifier envoi postal) →
-- « Envoyé le … - Courrier postal » (posté). Le secrétaire ne peut ni lire ni modifier la table `dons` :
-- il passe par deux fonctions qui ne lui montrent que les dons des reçus à poster qui lui ont été remis,
-- et qui ne modifient que l'état d'envoi.
--
-- Accès aux données chiffrées : le coffre (id 1) reçoit un troisième emballage de la clé de données, protégé par
-- un code propre au secrétaire (`sel_secretaire`, `dek_secretaire`). Il ne voit ni la phrase ni le code de secours
-- (les lignes de la table `coffre` restent réservées au bureau) ; le Trésorier génère ou retire ce code.

alter table public.coffre add column if not exists sel_secretaire text;
alter table public.coffre add column if not exists dek_secretaire text;

-- Éléments du coffre utiles au secrétaire pour s'ouvrir avec son code (jamais les emballages de la phrase ni du secours).
create or replace function public.coffre_pour_secretaire()
returns table (sel_secretaire text, dek_secretaire text, canari text)
language sql stable security definer set search_path = public as $$
  select c.sel_secretaire, c.dek_secretaire, c.canari
  from public.coffre c
  where c.id = 1 and c.dek_secretaire is not null and public.mon_role() = 'secretaire';
$$;

-- Dons des reçus à poster remis au secrétaire (tous les dons de ces reçus, pour le détail du PDF).
create or replace function public.courriers_a_confirmer()
returns table (
  id uuid, exercice_id uuid, origine text, categorie_donateur text, est_personne_morale boolean,
  donateur_titre text, donateur_nom text, donateur_prenom text, raison_sociale text,
  adresse text, cp_ville text, courriel text, pii_chiffre text,
  montant numeric, date_don date, mode_paiement text,
  recu_numero text, recu_etat text, recu_emis_le date, envoi_prefere text,
  observations text, supprime_le timestamptz, supprime_par text, operation_id uuid
)
language sql stable security definer set search_path = public as $$
  select d.id, d.exercice_id, d.origine, d.categorie_donateur, d.est_personne_morale,
         d.donateur_titre, d.donateur_nom, d.donateur_prenom, d.raison_sociale,
         d.adresse, d.cp_ville, d.courriel, d.pii_chiffre,
         d.montant, d.date_don, d.mode_paiement,
         d.recu_numero, d.recu_etat, d.recu_emis_le, d.envoi_prefere,
         d.observations, d.supprime_le, d.supprime_par, d.operation_id
  from public.dons d
  where d.supprime_le is null
    and d.recu_numero in (
      select x.recu_numero from public.dons x
      where x.supprime_le is null and x.envoi_prefere = 'courrier' and x.recu_etat = 'Passé au secrétaire'
    )
    and public.mon_role() in ('secretaire', 'tresorier', 'president', 'administrateur');
$$;

-- Le secrétaire (ou le bureau de trésorerie) confirme qu'un courrier est posté : seul l'état d'envoi change.
create or replace function public.confirmer_courrier_poste(p_numero text)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  n integer;
  jour date := (now() at time zone 'Europe/Paris')::date;
begin
  if public.mon_role() not in ('secretaire', 'tresorier', 'president', 'administrateur') then
    raise exception 'Accès refusé';
  end if;
  if not exists (
    select 1 from public.dons
    where recu_numero = p_numero and supprime_le is null and envoi_prefere = 'courrier' and recu_etat = 'Passé au secrétaire'
  ) then
    raise exception 'Ce reçu n''est pas dans les courriers à confirmer';
  end if;
  update public.dons
     set recu_etat = 'Envoyé le ' || to_char(jour, 'DD/MM/YYYY') || ' - Courrier postal'
   where recu_numero = p_numero and supprime_le is null;
  get diagnostics n = row_count;
  update public.recus set envoye_le = jour, envoi_mode = 'courrier' where recu_numero = p_numero;
  return n;
end;
$$;

revoke all on function public.coffre_pour_secretaire() from public, anon;
revoke all on function public.courriers_a_confirmer() from public, anon;
revoke all on function public.confirmer_courrier_poste(text) from public, anon;
grant execute on function public.coffre_pour_secretaire() to authenticated;
grant execute on function public.courriers_a_confirmer() to authenticated;
grant execute on function public.confirmer_courrier_poste(text) to authenticated;
