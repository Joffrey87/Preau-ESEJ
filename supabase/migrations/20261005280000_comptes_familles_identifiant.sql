-- 05/10/2026 — Connexion des familles par NOM DE FAMILLE + mot de passe (comme les rôles du bureau).
-- Un seul compte par famille, sous une adresse interne non routable `<identifiant>@familles.esej` ; le mot de passe
-- est donc le même pour Monsieur et Madame. Leurs vraies adresses électroniques ne servent qu'à la première
-- connexion (invitation, choix du mot de passe) et aux demandes de réinitialisation.
-- Remplace le montage « deux comptes liés » de 20261005270000 (déclencheur de synchronisation retiré).

drop trigger if exists synchroniser_mdp_famille on auth.users;
drop function if exists public.synchroniser_mdp_famille();
drop function if exists public.compte_famille_creer(uuid, smallint, text, text);

-- Identifiant de connexion : nom sans accents ni espaces (« de Blic » → « de-blic »).
create or replace function public.identifiant_famille(p_nom text) returns text
language sql immutable as $$
  select trim(both '-' from regexp_replace(
    translate(lower(p_nom), 'àâäáãéèêëíìîïóòôöõúùûüçñœ', 'aaaaaeeeeiiiiooooouuuucno'), '[^a-z0-9]+', '-', 'g'))
$$;

alter table public.familles add column if not exists identifiant text generated always as (public.identifiant_famille(nom)) stored;
create unique index if not exists familles_identifiant_idx on public.familles (identifiant);

-- Demandes de réinitialisation (mot de passe oublié) : traitées par le bureau, qui renvoie un lien.
create table if not exists public.demandes_raz_famille (
  id uuid primary key default gen_random_uuid(),
  famille_id uuid not null references public.familles(id) on delete cascade,
  courriel text not null,
  demande_le timestamptz not null default now(),
  traite_le timestamptz
);
alter table public.demandes_raz_famille enable row level security;

-- Une famille (non connectée) demande une réinitialisation : nom de famille + l'une de ses adresses connues.
-- Réponse toujours identique (rien n'indique si la famille ou l'adresse existe).
create or replace function public.demander_raz_famille(p_nom text, p_courriel text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare f public.familles%rowtype;
begin
  select * into f from public.familles where identifiant = public.identifiant_famille(coalesce(p_nom, ''));
  if found and lower(trim(coalesce(p_courriel, ''))) in (lower(coalesce(f.parent1_courriel, '-')), lower(coalesce(f.parent2_courriel, '-'))) then
    if not exists (select 1 from public.demandes_raz_famille where famille_id = f.id and traite_le is null
                      and demande_le > now() - interval '1 day') then
      insert into public.demandes_raz_famille (famille_id, courriel) values (f.id, lower(trim(p_courriel)));
    end if;
  end if;
end;
$$;
revoke all on function public.demander_raz_famille(text, text) from public;
grant execute on function public.demander_raz_famille(text, text) to anon, authenticated;

-- Générer un lien d'invitation clôt les demandes en attente de la famille.
create or replace function public.inviter_famille(p_famille uuid)
returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare code text;
begin
  if not (public.est_tresorier() or public.est_admin()) then
    raise exception 'Réservé au trésorier et aux administrateurs.';
  end if;
  if not exists (select 1 from public.familles where id = p_famille) then
    raise exception 'Famille introuvable.';
  end if;
  update public.invitations_famille set expire_le = now()
   where famille_id = p_famille and utilise_le is null and expire_le > now();
  update public.demandes_raz_famille set traite_le = now() where famille_id = p_famille and traite_le is null;
  code := translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');
  insert into public.invitations_famille (famille_id, code_hash)
  values (p_famille, encode(digest(code, 'sha256'), 'hex'));
  return code;
end;
$$;
revoke all on function public.inviter_famille(uuid) from public, anon;
grant execute on function public.inviter_famille(uuid) to authenticated;

-- La famille choisit son mot de passe : un seul compte (adresse interne), créé ou mis à jour.
create or replace function public.activer_invitation(p_code text, p_courriel1 text, p_courriel2 text, p_mdp text)
returns void
language plpgsql volatile security definer set search_path = public, auth, extensions as $$
declare
  inv public.invitations_famille%rowtype;
  fam public.familles%rowtype;
  c1 text := nullif(lower(trim(coalesce(p_courriel1, ''))), '');
  c2 text := nullif(lower(trim(coalesce(p_courriel2, ''))), '');
  motif text := '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$';
  login text;
  u uuid;
begin
  select * into inv from public.invitations_famille
   where code_hash = encode(digest(p_code, 'sha256'), 'hex') and utilise_le is null and expire_le > now();
  if not found then raise exception 'Ce lien n''est plus valide. Demandez à l''école de vous en envoyer un nouveau.'; end if;
  if length(coalesce(p_mdp, '')) < 10 then raise exception 'Le mot de passe doit comporter au moins 10 caractères.'; end if;
  if c1 is null and c2 is null then raise exception 'Indiquez au moins une adresse électronique (pour retrouver votre mot de passe).'; end if;
  if (c1 is not null and c1 !~ motif) or (c2 is not null and c2 !~ motif) then raise exception 'Adresse électronique invalide.'; end if;
  if c1 is not null and c1 = c2 then raise exception 'Les adresses de Monsieur et de Madame doivent être différentes.'; end if;

  select * into fam from public.familles where id = inv.famille_id;
  login := fam.identifiant || '@familles.esej';
  select id into u from public.profils where famille_id = fam.id and role = 'famille' limit 1;
  if u is null then
    u := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, email_change_token_current,
                            recovery_token, phone_change, phone_change_token, reauthentication_token)
    values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', login,
            crypt(p_mdp, gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"],"espace":"famille"}'::jsonb, '{}'::jsonb, now(), now(),
            '', '', '', '', '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u, u::text, 'email',
            jsonb_build_object('sub', u::text, 'email', login, 'email_verified', true), now(), now(), now());
    insert into public.profils (id, role, famille_id, courriel, actif)
    values (u, 'famille', fam.id, login, true)
    on conflict (id) do update set role = 'famille', famille_id = fam.id, courriel = login, actif = true;
  else
    update auth.users set email = login, encrypted_password = crypt(p_mdp, gen_salt('bf')), updated_at = now() where id = u;
    update public.profils set actif = true where id = u;
  end if;

  update public.familles set parent1_courriel = coalesce(c1, parent1_courriel), parent2_courriel = coalesce(c2, parent2_courriel)
   where id = fam.id;
  update public.invitations_famille set utilise_le = now() where id = inv.id;
end;
$$;
revoke all on function public.activer_invitation(text, text, text, text) from public;
grant execute on function public.activer_invitation(text, text, text, text) to anon, authenticated;

-- Enregistrement des coordonnées par la famille : les courriels ne servent plus à la connexion, simple mise à jour de la fiche.
create or replace function public.famille_enregistrer(p_infos jsonb, p_revalide boolean default false)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  fam uuid := public.ma_famille();
  champs text[] := array['adresse', 'cp_ville', 'parent1_prenom', 'parent1_nom', 'parent1_telephone', 'parent1_courriel',
                         'parent2_prenom', 'parent2_nom', 'parent2_telephone', 'parent2_courriel'];
  c text;
  ancien text;
  nouveau text;
  n integer := 0;
begin
  if fam is null then raise exception 'Accès refusé'; end if;
  foreach c in array champs loop
    if not (p_infos ? c) then continue; end if;
    nouveau := nullif(trim(p_infos ->> c), '');
    execute format('select %I from public.familles where id = $1', c) into ancien using fam;
    if ancien is not distinct from nouveau then continue; end if;
    execute format('update public.familles set %I = $1 where id = $2', c) using nouveau, fam;
    insert into public.familles_modifications (famille_id, champ, ancien, nouveau) values (fam, c, ancien, nouveau);
    n := n + 1;
  end loop;
  update public.familles f set
    telephone = nullif(concat_ws(' / ', f.parent1_telephone, f.parent2_telephone), ''),
    courriels = nullif(concat_ws(', ', f.parent1_courriel, f.parent2_courriel), ''),
    parent1 = nullif(trim(concat_ws(' ', f.parent1_prenom, f.parent1_nom)), ''),
    parent2 = nullif(trim(concat_ws(' ', f.parent2_prenom, f.parent2_nom)), '')
  where f.id = fam;
  if p_revalide and public.annee_revalidation() is not null then
    update public.familles set revalide_annee = public.annee_revalidation(), revalide_le = now() where id = fam;
  end if;
  return n;
end;
$$;
revoke all on function public.famille_enregistrer(jsonb, boolean) from public, anon;
grant execute on function public.famille_enregistrer(jsonb, boolean) to authenticated;

-- État des comptes, pour le bureau (trésorier, administrateur).
create or replace function public.acces_familles()
returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not (public.est_tresorier() or public.est_admin()) then raise exception 'Réservé au trésorier et aux administrateurs.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', f.id, 'nom', f.nom, 'identifiant', f.identifiant,
             'courriel1', f.parent1_courriel, 'courriel2', f.parent2_courriel,
             'compte', exists (select 1 from public.profils p where p.famille_id = f.id and p.role = 'famille'),
             'derniere_connexion', (select max(u.last_sign_in_at) from auth.users u
                                      join public.profils p on p.id = u.id where p.famille_id = f.id and p.role = 'famille'),
             'demande_raz', exists (select 1 from public.demandes_raz_famille d where d.famille_id = f.id and d.traite_le is null))
             order by f.nom)
      from public.familles f), '[]'::jsonb);
end;
$$;
revoke all on function public.acces_familles() from public, anon;
grant execute on function public.acces_familles() to authenticated;

-- Prospects : seuls ceux de la « Liste Axel » sont chiffrés (pii_chiffre). Les autres gardent leurs coordonnées en clair.
alter table public.prospects add column if not exists civilite text;
alter table public.prospects add column if not exists prenom text;
alter table public.prospects add column if not exists adresse text;
alter table public.prospects add column if not exists cp_ville text;
