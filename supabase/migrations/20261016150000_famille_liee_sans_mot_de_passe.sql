-- Famille réservée à la bascule (familles.masquee_connexion) : les comptes qui y sont reliés l'ouvrent SANS changer de
-- compte ni ressaisir de mot de passe. Toutes les règles de l'Espace famille passent par ma_famille() : elle renvoie
-- désormais aussi, pour ces seuls comptes, LEUR famille réservée. Comptes reliés :
--   · membre Événement dont la fiche pointe vers la famille (evenement_membres.famille_id) ;
--   · profil d'Administration désigné par familles.profil_lie (ex. : Président → Antona).
-- Aucune autre famille n'est concernée ; une famille non réservée garde l'ancien comportement (compte famille seul).
create or replace function public.ma_famille() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select famille_id from profils where id = auth.uid() and role = 'famille' and actif),
    (select f.id from evenement_membres m join familles f on f.id = m.famille_id
      where m.user_id = auth.uid() and f.masquee_connexion order by f.nom limit 1),
    (select f.id from familles f
      where f.masquee_connexion and f.profil_lie is not null and f.profil_lie = public.mon_role()
        and public.mon_role() <> 'famille' order by f.nom limit 1));
$$;

-- Le compte d'une famille (au sens strict), pour la bascule vers l'espace Événement : la famille liée d'un autre compte
-- ne compte pas (le Président ne doit pas se voir proposer Marie A.).
create or replace function public.membres_evenement_lies(p_prenom text default null)
returns table (libelle text, email text)
language sql stable security definer set search_path = public as $$
  select m.libelle, m.identifiant || '@evenement.esej'
    from evenement_membres m join familles f on f.id = m.famille_id
   where m.user_id is not null and (
         f.id = (select famille_id from profils where id = auth.uid() and role = 'famille' and actif)
      or (public.mon_role() = 'recherche-fonds' and f.membre_recherche is not null
          and lower(f.membre_recherche) = lower(coalesce(p_prenom, '')))
      or (public.mon_role() = 'directrice' and f.directrice_liee))
   order by m.libelle;
$$;

-- Famille réservée ouverte par ce compte (null s'il n'en a pas, ou s'il est lui-même un compte famille).
create or replace function public.ma_famille_liee() returns table (id uuid, nom text)
language sql stable security definer set search_path = public as $$
  select f.id, f.nom from familles f
   where f.id = public.ma_famille() and f.masquee_connexion
     and not exists (select 1 from profils where id = auth.uid() and role = 'famille');
$$;
revoke all on function public.ma_famille_liee() from public, anon;
grant execute on function public.ma_famille_liee() to authenticated;
