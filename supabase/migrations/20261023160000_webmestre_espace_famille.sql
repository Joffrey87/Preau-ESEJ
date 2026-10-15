-- 23/10/2026 — Le Webmestre ouvre l'Espace de n'importe quelle famille (avec les droits de cette famille), sans son
-- mot de passe ; chaque ouverture / fermeture est journalisée. Liens d'invitation conservés pour la Directrice et le
-- Webmestre (bouton Copier ; rien n'est envoyé).

create table if not exists public.webmestre_famille_vue (
  user_id uuid primary key references auth.users(id) on delete cascade,
  famille_id uuid not null references public.familles(id) on delete cascade,
  depuis timestamptz not null default now()
);
alter table public.webmestre_famille_vue enable row level security;

create table if not exists public.webmestre_famille_journal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profil text,
  famille_id uuid references public.familles(id) on delete set null,
  action text not null check (action in ('ouverture', 'fermeture')),
  le timestamptz not null default now()
);
alter table public.webmestre_famille_journal enable row level security;
drop policy if exists webmestre_famille_journal_lecture on public.webmestre_famille_journal;
create policy webmestre_famille_journal_lecture on public.webmestre_famille_journal for select to authenticated
  using (public.est_webmestre() or public.peut_voir_sensible());
grant select on public.webmestre_famille_journal to authenticated;

/** Famille ouverte par le Webmestre (valable 12 h), sinon null. */
create or replace function public.famille_du_webmestre() returns uuid
language sql stable security definer set search_path = public as $$
  select v.famille_id from webmestre_famille_vue v
   where v.user_id = auth.uid() and v.depuis > now() - interval '12 hours' and public.est_webmestre();
$$;
revoke all on function public.famille_du_webmestre() from public, anon;
grant execute on function public.famille_du_webmestre() to authenticated;

create or replace function public.webmestre_famille_ouvrir(p_famille uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.est_webmestre() then raise exception 'Réservé au Webmestre' using errcode = '42501'; end if;
  if not exists (select 1 from familles where id = p_famille) then raise exception 'Famille introuvable'; end if;
  insert into webmestre_famille_vue (user_id, famille_id) values (auth.uid(), p_famille)
  on conflict (user_id) do update set famille_id = excluded.famille_id, depuis = now();
  insert into webmestre_famille_journal (user_id, profil, famille_id, action) values (auth.uid(), public.mon_role_reel(), p_famille, 'ouverture');
end;
$$;
revoke all on function public.webmestre_famille_ouvrir(uuid) from public, anon;
grant execute on function public.webmestre_famille_ouvrir(uuid) to authenticated;

create or replace function public.webmestre_famille_fermer() returns void
language plpgsql volatile security definer set search_path = public as $$
declare f uuid;
begin
  delete from webmestre_famille_vue where user_id = auth.uid() returning famille_id into f;
  if f is not null then
    insert into webmestre_famille_journal (user_id, profil, famille_id, action) values (auth.uid(), public.mon_role_reel(), f, 'fermeture');
  end if;
end;
$$;
revoke all on function public.webmestre_famille_fermer() from public, anon;
grant execute on function public.webmestre_famille_fermer() to authenticated;

-- ma_famille : la famille ouverte par le Webmestre passe en premier (après un vrai compte famille).
create or replace function public.ma_famille() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select famille_id from profils where id = auth.uid() and role = 'famille' and actif),
    public.famille_du_webmestre(),
    (select f.id from evenement_membres m join familles f on f.id = m.famille_id
      where m.user_id = auth.uid() and f.masquee_connexion order by f.nom limit 1),
    (select f.id from familles f
      where f.masquee_connexion and f.profil_lie is not null and f.profil_lie = public.mon_role()
        and public.mon_role() <> 'famille' order by f.nom limit 1));
$$;

create or replace function public.ma_famille_liee() returns table (id uuid, nom text)
language sql stable security definer set search_path = public as $$
  select f.id, f.nom from familles f
   where f.id = public.ma_famille() and (f.masquee_connexion or f.id = public.famille_du_webmestre())
     and not exists (select 1 from profils where id = auth.uid() and role = 'famille');
$$;
revoke all on function public.ma_famille_liee() from public, anon;
grant execute on function public.ma_famille_liee() to authenticated;

-- Liens d'invitation conservés en clair (lecture : Directrice et Webmestre) ; le code reste vérifié par son empreinte.
create table if not exists public.invitations_famille_liens (
  famille_id uuid primary key references public.familles(id) on delete cascade,
  code text not null,
  cree_le timestamptz not null default now(),
  expire_le timestamptz not null
);
alter table public.invitations_famille_liens enable row level security;
drop policy if exists invitations_famille_liens_lecture on public.invitations_famille_liens;
create policy invitations_famille_liens_lecture on public.invitations_famille_liens for select to authenticated
  using (public.est_directrice() or public.est_webmestre() or public.est_tresorier() or public.est_admin());
grant select on public.invitations_famille_liens to authenticated;

/** Génère (ou régénère) et conserve le lien d'invitation d'une famille. Directrice, Webmestre, Trésorier, admin. */
create or replace function public.invitation_famille_conserver(p_famille uuid) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare code text;
begin
  if not (public.est_directrice() or public.est_webmestre() or public.est_tresorier() or public.est_admin()) then
    raise exception 'Accès refusé';
  end if;
  if not exists (select 1 from familles where id = p_famille) then raise exception 'Famille introuvable.'; end if;
  update invitations_famille set expire_le = now() where famille_id = p_famille and utilise_le is null and expire_le > now();
  code := translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');
  insert into invitations_famille (famille_id, code_hash, expire_le)
  values (p_famille, encode(digest(code, 'sha256'), 'hex'), now() + interval '60 days');
  insert into invitations_famille_liens (famille_id, code, expire_le) values (p_famille, code, now() + interval '60 days')
  on conflict (famille_id) do update set code = excluded.code, cree_le = now(), expire_le = excluded.expire_le;
  return code;
end;
$$;
revoke all on function public.invitation_famille_conserver(uuid) from public, anon;
grant execute on function public.invitation_famille_conserver(uuid) to authenticated;
