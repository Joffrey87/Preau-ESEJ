-- Bascule au logo Préau vers l'espace Événement : un compte famille ou Recherche de fonds relié à un membre Événement
-- (evenement_membres.famille_id ; Recherche de fonds via familles.membre_recherche) ouvre le compte Événement de ce
-- membre, comme la bascule existante entre Espace famille / Recherche de fonds / Directrice. Aucun droit n'est élargi :
-- on agit avec le compte Événement du membre, donc avec exactement ses droits (RLS inchangée).

-- Membre(s) Événement relié(s) au compte connecté.
create or replace function public.membres_evenement_lies(p_prenom text default null)
returns table (libelle text, email text)
language sql stable security definer set search_path = public as $$
  select m.libelle, m.identifiant || '@evenement.esej'
    from evenement_membres m join familles f on f.id = m.famille_id
   where m.user_id is not null and (
         (public.ma_famille() is not null and f.id = public.ma_famille())
      or (public.mon_role() = 'recherche-fonds' and f.membre_recherche is not null
          and lower(f.membre_recherche) = lower(coalesce(p_prenom, '')))
      or (public.mon_role() = 'directrice' and f.directrice_liee)
      or (public.mon_role() = 'president' and f.profil_lie = 'president'))
   order by m.libelle;
$$;
revoke all on function public.membres_evenement_lies(text) from public, anon;
grant execute on function public.membres_evenement_lies(text) to authenticated;

-- Pour le membre Événement connecté : sa famille et les espaces qui y sont reliés (retour par le logo).
create or replace function public.mes_liens_evenement()
returns table (famille text, membre_recherche text, directrice boolean, president boolean)
language sql stable security definer set search_path = public as $$
  select f.nom, f.membre_recherche, f.directrice_liee, f.profil_lie = 'president'
    from evenement_membres m join familles f on f.id = m.famille_id
   where m.user_id = auth.uid() and public.est_evenement();
$$;
revoke all on function public.mes_liens_evenement() from public, anon;
grant execute on function public.mes_liens_evenement() to authenticated;

-- Page Membres : nom de la famille reliée (le profil Événement ne lit pas la table familles).
create or replace function public.familles_membres_evenement()
returns table (membre_id uuid, famille text, membre_recherche text)
language sql stable security definer set search_path = public as $$
  select m.id, f.nom, f.membre_recherche from evenement_membres m join familles f on f.id = m.famille_id
   where public.voit_evenements();
$$;
revoke all on function public.familles_membres_evenement() from public, anon;
grant execute on function public.familles_membres_evenement() to authenticated;
