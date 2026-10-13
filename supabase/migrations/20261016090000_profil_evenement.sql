-- Profil « Événement » : comptes simples (identifiant = prénom, mot de passe = prénom), cantonnés aux
-- événements et à leur caisse. Aucun accès au bureau (ils ne sont pas dans est_bureau()).

alter table public.profils drop constraint if exists profils_role_check;
alter table public.profils add constraint profils_role_check check (role in (
  'president','tresorier','secretaire','administrateur','directrice',
  'directeur-spirituel','resp-mecenat','lecteur','famille','professeur','evenement'));

create or replace function public.est_evenement() returns boolean
language sql stable security definer set search_path = public as $$
  select public.mon_role() = 'evenement';
$$;
revoke execute on function public.est_evenement() from public, anon;
grant execute on function public.est_evenement() to authenticated;

create table if not exists public.evenement_membres (
  id uuid primary key default gen_random_uuid(),
  libelle text not null unique,            -- affiché à la connexion (« Marie A. »)
  prenom text not null,
  nom text,
  courriel text,
  identifiant text not null unique,        -- <identifiant>@evenement.esej
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.evenements_caisse (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  date date not null,
  responsable_id uuid references public.evenement_membres(id) on delete set null,
  caisse_avant numeric(10,2),
  caisse_apres numeric(10,2),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

alter table public.evenement_membres enable row level security;
alter table public.evenements_caisse enable row level security;
grant select on public.evenement_membres to authenticated;
grant select, insert, update, delete on public.evenements_caisse to authenticated;

-- Lecture : membres Événement et Trésorier. Ajout de membres uniquement par la fonction ci-dessous.
create policy evenement_membres_lecture on public.evenement_membres for select to authenticated
  using (public.est_evenement() or public.est_tresorier());
create policy evenements_caisse_tout on public.evenements_caisse for all to authenticated
  using (public.est_evenement() or public.est_tresorier())
  with check (public.est_evenement() or public.est_tresorier());

-- Règle des identifiants : comme les familles (sans accents, espaces, ponctuation).
create or replace function public.identifiant_evenement(p text) returns text
language sql stable set search_path = public as $$
  select regexp_replace(lower(public.unaccent_simple(p)), '[^a-z0-9]+', '', 'g');
$$;

-- Création interne d'un compte (mot de passe = prénom, sans accents ni majuscules).
create or replace function public._creer_membre_evenement(p_libelle text, p_prenom text, p_nom text, p_courriel text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  ident text := public.identifiant_evenement(p_libelle);
  login text := ident || '@evenement.esej';
  mdp text := public.identifiant_evenement(p_prenom);
  u uuid;
  m uuid;
begin
  if ident = '' or mdp = '' then raise exception 'Prénom manquant.'; end if;
  if exists (select 1 from evenement_membres where identifiant = ident) then
    raise exception 'Un membre « % » existe déjà.', p_libelle;
  end if;
  select id into u from auth.users where email = login;
  if u is null then
    u := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, email_change_token_current,
                            recovery_token, phone_change, phone_change_token, reauthentication_token)
    values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', login,
            crypt(mdp, gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"],"espace":"evenement"}'::jsonb, '{}'::jsonb, now(), now(),
            '', '', '', '', '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u, u::text, 'email',
            jsonb_build_object('sub', u::text, 'email', login, 'email_verified', true), now(), now(), now());
  end if;
  insert into profils (id, role, prenom, nom, courriel, actif) values (u, 'evenement', p_prenom, p_nom, p_courriel, true)
    on conflict (id) do update set role = 'evenement', actif = true;
  insert into evenement_membres (libelle, prenom, nom, courriel, identifiant, user_id)
    values (p_libelle, p_prenom, p_nom, p_courriel, ident, u) returning id into m;
  return m;
end;
$$;
revoke all on function public._creer_membre_evenement(text, text, text, text) from public, anon, authenticated;

-- Ajout d'un membre par un membre (ou le Trésorier) : nom, prénom, courriel obligatoires.
-- Si le prénom est déjà pris, le libellé devient « Prénom N. ».
create or replace function public.ajouter_membre_evenement(p_prenom text, p_nom text, p_courriel text)
returns uuid language plpgsql security definer set search_path = public as $$
declare lib text := initcap(trim(p_prenom));
begin
  if not (public.est_evenement() or public.est_tresorier()) then raise exception 'Accès refusé.'; end if;
  if coalesce(trim(p_prenom),'') = '' or coalesce(trim(p_nom),'') = '' or coalesce(trim(p_courriel),'') = '' then
    raise exception 'Nom, prénom et courriel sont obligatoires.'; end if;
  if trim(p_courriel) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Adresse électronique invalide.'; end if;
  if exists (select 1 from evenement_membres where identifiant = public.identifiant_evenement(lib)) then
    lib := lib || ' ' || upper(left(trim(p_nom),1)) || '.';
  end if;
  return public._creer_membre_evenement(lib, initcap(trim(p_prenom)), trim(p_nom), lower(trim(p_courriel)));
end;
$$;
revoke all on function public.ajouter_membre_evenement(text, text, text) from public, anon;
grant execute on function public.ajouter_membre_evenement(text, text, text) to authenticated;

-- Liste de l'écran de connexion (sans session) : libellé et adresse interne seulement.
create or replace function public.evenement_connexion() returns table (libelle text, email text)
language sql stable security definer set search_path = public as $$
  select libelle, identifiant || '@evenement.esej' from evenement_membres where user_id is not null order by libelle;
$$;
revoke all on function public.evenement_connexion() from public;
grant execute on function public.evenement_connexion() to anon, authenticated;

-- Membres de départ.
select public._creer_membre_evenement(l, p, null, null)
  from (values ('Antonia','Antonia'),('Astrid','Astrid'),('Charlotte','Charlotte'),
               ('Marie A.','Marie'),('Marie W.','Marie'),('Pauline','Pauline')) v(l, p)
 where not exists (select 1 from public.evenement_membres where libelle = v.l);
