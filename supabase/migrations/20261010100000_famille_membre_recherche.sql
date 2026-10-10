-- 10/10/2026 — Une famille dont un parent est aussi membre de « Recherche de fonds » passe d'un espace à l'autre
-- (logo en haut à gauche) sans ressaisir son nom : `familles.membre_recherche` porte le prénom du membre
-- (liste MEMBRES de l'application : Alexis, Axel, Baptiste, Joffrey, Pierre-Emmanuel, Pierre-Louis).
-- Le profil « Recherche de fonds » retrouve la famille liée à son prénom par `famille_du_membre`.

alter table public.familles add column if not exists membre_recherche text;

update public.familles set membre_recherche = 'Alexis' where identifiant = 'dufour';
update public.familles set membre_recherche = 'Pierre-Emmanuel' where identifiant = 'de-blic';
update public.familles set membre_recherche = 'Baptiste' where identifiant = 'warnan';
update public.familles set membre_recherche = 'Pierre-Louis' where identifiant = 'letellier';
update public.familles set membre_recherche = 'Axel' where identifiant = 'picard-a';
update public.familles set membre_recherche = 'Joffrey' where identifiant = 'lenoble'; -- famille test

create or replace function public.famille_du_membre(p_prenom text)
returns text
language sql stable security definer set search_path = public as $$
  select f.nom from public.familles f
   where f.membre_recherche is not null and lower(f.membre_recherche) = lower(coalesce(p_prenom, ''))
     and public.mon_role() in ('recherche-fonds', 'tresorier', 'president', 'administrateur')
   limit 1;
$$;
revoke all on function public.famille_du_membre(text) from public, anon;
grant execute on function public.famille_du_membre(text) to authenticated;
