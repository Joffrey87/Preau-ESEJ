-- Antona : la famille du Président n'est pas proposée à la connexion « Famille » de l'accueil ; on y entre par la
-- bascule du logo (depuis le Président ou Marie A., Événement). Drapeau par famille, sans nom codé en dur.
alter table public.familles add column if not exists masquee_connexion boolean not null default false;
update public.familles set masquee_connexion = true where profil_lie = 'president' and nom = 'Antona';

-- Accueil (sans session) : la famille saisie est-elle réservée à la bascule ? (ne révèle rien d'autre)
create or replace function public.famille_masquee_connexion(p_identifiant text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select masquee_connexion from familles where identifiant = p_identifiant limit 1), false);
$$;
revoke all on function public.famille_masquee_connexion(text) from public;
grant execute on function public.famille_masquee_connexion(text) to anon, authenticated;

-- Le Président ne se voit plus proposer l'espace Événement (Marie A. reste reliée à la famille Antona).
create or replace function public.membres_evenement_lies(p_prenom text default null)
returns table (libelle text, email text)
language sql stable security definer set search_path = public as $$
  select m.libelle, m.identifiant || '@evenement.esej'
    from evenement_membres m join familles f on f.id = m.famille_id
   where m.user_id is not null and (
         (public.ma_famille() is not null and f.id = public.ma_famille())
      or (public.mon_role() = 'recherche-fonds' and f.membre_recherche is not null
          and lower(f.membre_recherche) = lower(coalesce(p_prenom, '')))
      or (public.mon_role() = 'directrice' and f.directrice_liee))
   order by m.libelle;
$$;
