-- 05/10/2026 — Accès des familles à leur espace : deux comptes par famille (Monsieur et Madame, chacun avec son courriel),
-- MÊME mot de passe pour les deux. Invitation par lien personnel (à transmettre par la messagerie du bureau), sans
-- dépendre de l'envoi automatique de courriels.
--
--  - profils.parent               : 1 = Monsieur, 2 = Madame (compte rattaché à une famille) ;
--  - invitations_famille          : liens d'invitation à usage unique (seule l'empreinte du code est conservée) ;
--  - inviter_famille(famille)     : le trésorier / l'administrateur génère un lien (valable 14 jours) ;
--  - invitation_infos(code)       : ce que la page d'invitation affiche (nom de la famille, courriels suggérés) ;
--  - activer_invitation(...)      : la famille choisit son mot de passe ; les deux comptes sont créés avec le même ;
--  - déclencheur                  : un changement de mot de passe d'un conjoint est recopié sur l'autre compte ;
--  - famille_enregistrer          : un courriel modifié par la famille met aussi à jour l'adresse de connexion ;
--  - acces_familles()             : état des comptes de chaque famille, pour le bureau.

alter table public.profils add column if not exists parent smallint check (parent in (1, 2));

create table if not exists public.invitations_famille (
  id uuid primary key default gen_random_uuid(),
  famille_id uuid not null references public.familles(id) on delete cascade,
  code_hash text not null unique,
  cree_le timestamptz not null default now(),
  expire_le timestamptz not null default now() + interval '14 days',
  utilise_le timestamptz
);
alter table public.invitations_famille enable row level security; -- aucune politique : accès par les fonctions seulement

-- Courriels déjà connus des inscriptions (Frais de scolarité) : proposés à la famille à l'invitation.
-- Premier courriel = Monsieur, second = Madame (modifiables ensuite par la famille).
update public.familles f set
  parent1_courriel = coalesce(f.parent1_courriel, (
    select (regexp_match(i.emails, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'))[1]
      from public.scolarite_inscriptions i where i.famille_id = f.id and i.emails is not null
      order by i.annee_scolaire desc limit 1)),
  parent2_courriel = coalesce(f.parent2_courriel, (
    select (regexp_matches(i.emails, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', 'g'))[1]
      from public.scolarite_inscriptions i where i.famille_id = f.id and i.emails is not null
        and array_length(regexp_split_to_array(i.emails, '@'), 1) > 2
      order by i.annee_scolaire desc limit 1 offset 1))
where f.parent1_courriel is null or f.parent2_courriel is null;

-- ---------------------------------------------------------------------------
-- Invitation
-- ---------------------------------------------------------------------------
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
  code := translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');
  insert into public.invitations_famille (famille_id, code_hash)
  values (p_famille, encode(digest(code, 'sha256'), 'hex'));
  return code;
end;
$$;
revoke all on function public.inviter_famille(uuid) from public, anon;
grant execute on function public.inviter_famille(uuid) to authenticated;

create or replace function public.invitation_infos(p_code text)
returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
           'famille', f.nom,
           'prenom1', f.parent1_prenom, 'prenom2', f.parent2_prenom,
           'courriel1', f.parent1_courriel, 'courriel2', f.parent2_courriel)
    from public.invitations_famille i
    join public.familles f on f.id = i.famille_id
   where i.code_hash = encode(digest(p_code, 'sha256'), 'hex')
     and i.utilise_le is null and i.expire_le > now();
$$;
revoke all on function public.invitation_infos(text) from public;
grant execute on function public.invitation_infos(text) to anon, authenticated;

-- Crée (ou met à jour) le compte d'un conjoint de la famille.
create or replace function public.compte_famille_creer(p_famille uuid, p_parent smallint, p_courriel text, p_mdp text)
returns void
language plpgsql volatile security definer set search_path = public, auth, extensions as $$
declare
  u uuid;
  autre uuid;
begin
  -- Compte déjà rattaché à cette place (Monsieur / Madame) de la famille ?
  select id into u from public.profils where famille_id = p_famille and parent = p_parent and role = 'famille';
  select id into autre from auth.users where lower(email) = lower(p_courriel) and (u is null or id <> u);
  if autre is not null then raise exception 'Cette adresse est déjà utilisée par un autre compte : %', p_courriel; end if;

  if u is null then
    u := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, email_change_token_current,
                            recovery_token, phone_change, phone_change_token, reauthentication_token)
    values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', lower(p_courriel),
            crypt(p_mdp, gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"],"espace":"famille"}'::jsonb, '{}'::jsonb, now(), now(),
            '', '', '', '', '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u, u::text, 'email',
            jsonb_build_object('sub', u::text, 'email', lower(p_courriel), 'email_verified', true), now(), now(), now());
    insert into public.profils (id, role, famille_id, courriel, actif, parent)
    values (u, 'famille', p_famille, lower(p_courriel), true, p_parent)
    on conflict (id) do update set role = 'famille', famille_id = p_famille, courriel = lower(p_courriel), actif = true, parent = p_parent;
  else
    update auth.users set email = lower(p_courriel), encrypted_password = crypt(p_mdp, gen_salt('bf')), updated_at = now()
     where id = u;
    update auth.identities set identity_data = identity_data || jsonb_build_object('email', lower(p_courriel))
     where user_id = u and provider = 'email';
    update public.profils set courriel = lower(p_courriel), actif = true where id = u;
  end if;
end;
$$;
revoke all on function public.compte_famille_creer(uuid, smallint, text, text) from public, anon, authenticated;

create or replace function public.activer_invitation(p_code text, p_courriel1 text, p_courriel2 text, p_mdp text)
returns void
language plpgsql volatile security definer set search_path = public, auth, extensions as $$
declare
  inv public.invitations_famille%rowtype;
  c1 text := nullif(lower(trim(coalesce(p_courriel1, ''))), '');
  c2 text := nullif(lower(trim(coalesce(p_courriel2, ''))), '');
  motif text := '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$';
begin
  select * into inv from public.invitations_famille
   where code_hash = encode(digest(p_code, 'sha256'), 'hex') and utilise_le is null and expire_le > now();
  if not found then raise exception 'Ce lien n''est plus valide. Demandez à l''école de vous en envoyer un nouveau.'; end if;
  if length(coalesce(p_mdp, '')) < 10 then raise exception 'Le mot de passe doit comporter au moins 10 caractères.'; end if;
  if c1 is null and c2 is null then raise exception 'Indiquez au moins une adresse électronique.'; end if;
  if (c1 is not null and c1 !~ motif) or (c2 is not null and c2 !~ motif) then raise exception 'Adresse électronique invalide.'; end if;
  if c1 is not null and c1 = c2 then raise exception 'Les adresses de Monsieur et de Madame doivent être différentes.'; end if;

  if c1 is not null then perform public.compte_famille_creer(inv.famille_id, 1::smallint, c1, p_mdp); end if;
  if c2 is not null then perform public.compte_famille_creer(inv.famille_id, 2::smallint, c2, p_mdp); end if;
  update public.familles set parent1_courriel = coalesce(c1, parent1_courriel), parent2_courriel = coalesce(c2, parent2_courriel)
   where id = inv.famille_id;
  update public.invitations_famille set utilise_le = now() where id = inv.id;
end;
$$;
revoke all on function public.activer_invitation(text, text, text, text) from public;
grant execute on function public.activer_invitation(text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Même mot de passe pour Monsieur et Madame : recopié d'un compte à l'autre.
-- ---------------------------------------------------------------------------
create or replace function public.synchroniser_mdp_famille() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  if new.encrypted_password is not distinct from old.encrypted_password then return new; end if;
  update auth.users u set encrypted_password = new.encrypted_password, updated_at = now()
   where u.id in (
           select p2.id from public.profils p1
             join public.profils p2 on p2.famille_id = p1.famille_id and p2.id <> p1.id and p2.role = 'famille'
            where p1.id = new.id and p1.role = 'famille')
     and u.encrypted_password is distinct from new.encrypted_password;
  return new;
end;
$$;
drop trigger if exists synchroniser_mdp_famille on auth.users;
create trigger synchroniser_mdp_famille after update of encrypted_password on auth.users
  for each row execute function public.synchroniser_mdp_famille();

-- ---------------------------------------------------------------------------
-- Un courriel modifié par la famille met aussi à jour l'adresse de connexion du conjoint concerné.
-- ---------------------------------------------------------------------------
create or replace function public.famille_enregistrer(p_infos jsonb, p_revalide boolean default false)
returns integer
language plpgsql volatile security definer set search_path = public, auth as $$
declare
  fam uuid := public.ma_famille();
  champs text[] := array['adresse', 'cp_ville', 'parent1_prenom', 'parent1_nom', 'parent1_telephone', 'parent1_courriel',
                         'parent2_prenom', 'parent2_nom', 'parent2_telephone', 'parent2_courriel'];
  c text;
  ancien text;
  nouveau text;
  n integer := 0;
  compte uuid;
  autre uuid;
begin
  if fam is null then raise exception 'Accès refusé'; end if;
  foreach c in array champs loop
    if not (p_infos ? c) then continue; end if;
    nouveau := nullif(trim(p_infos ->> c), '');
    execute format('select %I from public.familles where id = $1', c) into ancien using fam;
    if ancien is not distinct from nouveau then continue; end if;
    if c in ('parent1_courriel', 'parent2_courriel') and nouveau is not null then
      select id into compte from public.profils where famille_id = fam and role = 'famille'
         and parent = case when c = 'parent1_courriel' then 1 else 2 end;
      select id into autre from auth.users where lower(email) = lower(nouveau) and (compte is null or id <> compte);
      if autre is not null then raise exception 'Cette adresse est déjà utilisée par un autre compte : %', nouveau; end if;
      if compte is not null then
        update auth.users set email = lower(nouveau), updated_at = now() where id = compte;
        update auth.identities set identity_data = identity_data || jsonb_build_object('email', lower(nouveau))
         where user_id = compte and provider = 'email';
        update public.profils set courriel = lower(nouveau) where id = compte;
      end if;
    end if;
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

-- ---------------------------------------------------------------------------
-- État des comptes, pour le bureau (trésorier, administrateur)
-- ---------------------------------------------------------------------------
create or replace function public.acces_familles()
returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not (public.est_tresorier() or public.est_admin()) then raise exception 'Réservé au trésorier et aux administrateurs.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', f.id, 'nom', f.nom,
             'courriel1', f.parent1_courriel, 'courriel2', f.parent2_courriel,
             'compte1', (select p.courriel from public.profils p where p.famille_id = f.id and p.parent = 1 and p.role = 'famille'),
             'compte2', (select p.courriel from public.profils p where p.famille_id = f.id and p.parent = 2 and p.role = 'famille'),
             'derniere_connexion', (select max(u.last_sign_in_at) from auth.users u
                                      join public.profils p on p.id = u.id where p.famille_id = f.id and p.role = 'famille'))
             order by f.nom)
      from public.familles f), '[]'::jsonb);
end;
$$;
revoke all on function public.acces_familles() from public, anon;
grant execute on function public.acces_familles() to authenticated;
