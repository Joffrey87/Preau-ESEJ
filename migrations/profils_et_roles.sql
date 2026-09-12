-- Rôles appliqués EN BASE, et non plus seulement dans l'interface.
--
-- Aujourd'hui toutes les politiques disent « tout utilisateur authentifié peut
-- tout lire et tout écrire » : quiconque possède un compte peut contourner
-- l'interface et lire les IBAN ou les dons. Cette migration adosse les droits
-- à un rôle stocké en base.
--
-- Compatible avec les deux modèles de connexion :
--   - actuel   : 7 comptes de rôle partagés (president@roles.esej, …) ;
--   - à venir  : un compte nominatif par membre du bureau, avec sa vraie adresse.
--
-- EXÉCUTÉE le 02/09/2026. Conservée pour la reprise et la passation.

-- ---------------------------------------------------------------------------
-- 1. La table des profils
-- ---------------------------------------------------------------------------
create table if not exists profils (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'lecteur'
             check (role in ('president','tresorier','secretaire','administrateur',
                             'directrice','directeur-spirituel','resp-mecenat','lecteur')),
  nom        text,
  prenom     text,
  courriel   text,   -- adresse réelle de la personne, indépendante du compte
  actif      boolean not null default true,
  created_at timestamptz not null default now()
);

alter table profils enable row level security;

-- Chacun lit son propre profil ; seuls président et administrateur voient tout.
drop policy if exists profils_lecture on profils;
create policy profils_lecture on profils
  for select to authenticated
  using (id = auth.uid() or public.est_admin());

drop policy if exists profils_ecriture on profils;
create policy profils_ecriture on profils
  for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

-- ---------------------------------------------------------------------------
-- 2. Fonctions d'aide
--    SECURITY DEFINER : elles lisent `profils` sans être soumises à sa propre
--    politique, ce qui éviterait une récursion infinie.
-- ---------------------------------------------------------------------------
create or replace function public.mon_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from profils where id = auth.uid() and actif),
    -- Repli : comptes de rôle historiques (president@roles.esej, …).
    (select split_part(email, '@', 1) from auth.users
      where id = auth.uid() and email like '%@roles.esej'),
    'lecteur'
  );
$$;

create or replace function public.est_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.mon_role() in ('president', 'administrateur');
$$;

-- Peut tenir la comptabilité et le fichier des dons.
create or replace function public.est_tresorier() returns boolean
language sql stable security definer set search_path = public as $$
  select public.mon_role() in ('president', 'administrateur', 'tresorier');
$$;

-- Peut consulter les données sensibles (dons, IBAN, coordonnées).
create or replace function public.peut_voir_sensible() returns boolean
language sql stable security definer set search_path = public as $$
  select public.mon_role() in ('president', 'administrateur', 'tresorier', 'resp-mecenat');
$$;

-- ---------------------------------------------------------------------------
-- 3. Amorce : un profil pour chaque compte existant, déduit de son adresse
-- ---------------------------------------------------------------------------
insert into profils (id, role)
select u.id, split_part(u.email, '@', 1)
from auth.users u
where u.email like '%@roles.esej'
  and split_part(u.email, '@', 1) in
      ('president','tresorier','secretaire','administrateur',
       'directrice','directeur-spirituel','resp-mecenat')
on conflict (id) do nothing;

-- Le trésorier en exercice : son adresse réelle, portée par le compte de rôle
-- tant qu'un compte nominatif n'a pas été créé.
update profils set courriel = 'j.lenoble@pm.me', prenom = 'Joffrey', nom = 'Lenoble'
where id = (select id from auth.users where email = 'tresorier@roles.esej');

-- ---------------------------------------------------------------------------
-- 4. Politiques par table
--    Lecture largement ouverte au bureau, écriture réservée, données
--    sensibles restreintes.
-- ---------------------------------------------------------------------------

-- Comptabilité : lecture pour tout le bureau, écriture pour le trésorier.
do $$
declare t text;
begin
  foreach t in array array['operations','categories','comptes','exercices','budget_lignes','correspondances']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists auth_all on %I', t);          -- nom historique
    execute format('drop policy if exists %I_auth_all on %I', t, t);     -- variante préfixée
    execute format('drop policy if exists %I_lecture on %I', t, t);
    execute format('drop policy if exists %I_ecriture on %I', t, t);
    execute format('create policy %I_lecture on %I for select to authenticated using (true)', t, t);
    execute format('create policy %I_ecriture on %I for all to authenticated using (public.est_tresorier()) with check (public.est_tresorier())', t, t);
  end loop;
end $$;

-- Données sensibles : dons, carnet, coffre, reçus.
do $$
declare t text;
begin
  foreach t in array array['dons','contacts','prospects','echeances']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists auth_all on %I', t);          -- nom historique
    execute format('drop policy if exists %I_auth_all on %I', t, t);     -- variante préfixée
    execute format('drop policy if exists %I_lecture on %I', t, t);
    execute format('drop policy if exists %I_ecriture on %I', t, t);
    execute format('create policy %I_lecture on %I for select to authenticated using (public.peut_voir_sensible())', t, t);
    execute format('create policy %I_ecriture on %I for all to authenticated using (public.est_tresorier()) with check (public.est_tresorier())', t, t);
  end loop;
end $$;

-- Tables restantes : lecture pour le bureau, écriture au trésorier.
do $$
declare t text;
begin
  foreach t in array array['organisation','scolarite_bareme','scolarite_inscriptions',
                           'evenements','financements','taches']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists auth_all on %I', t);
    execute format('drop policy if exists %I_auth_all on %I', t, t);
    execute format('drop policy if exists %I_lecture on %I', t, t);
    execute format('drop policy if exists %I_ecriture on %I', t, t);
    execute format('create policy %I_lecture on %I for select to authenticated using (true)', t, t);
    execute format('create policy %I_ecriture on %I for all to authenticated using (public.est_tresorier()) with check (public.est_tresorier())', t, t);
  end loop;
end $$;

-- Le coffre : lisible par qui peut voir le sensible, modifiable par le trésorier.
alter table coffre enable row level security;
drop policy if exists coffre_auth_all on coffre;
drop policy if exists coffre_lecture on coffre;
drop policy if exists coffre_ecriture on coffre;
create policy coffre_lecture on coffre for select to authenticated using (public.peut_voir_sensible());
create policy coffre_ecriture on coffre for all to authenticated using (public.est_tresorier()) with check (public.est_tresorier());

-- ---------------------------------------------------------------------------
-- 5. Contrôles
-- ---------------------------------------------------------------------------
select u.email, p.role, p.actif from profils p join auth.users u on u.id = p.id order by p.role;

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
