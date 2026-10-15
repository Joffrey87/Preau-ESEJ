-- 15/10/2026 — Messagerie « Communication » enrichie :
--  - pièces jointes (bucket privé « messagerie », 10 Mo par fichier : images, PDF, Word, Excel) : le fichier est déposé
--    sous le dossier de la boîte qui l'envoie (<boite>/<uuid>/<nom>), puis cité par le message ; seuls les
--    participants des fils où il est cité (et la boîte qui l'a déposé) peuvent le lire ;
--  - groupes de discussion : un fil à plusieurs participants, renommable par son créateur ; tout participant peut
--    ajouter des membres (sauf aux fils d'un envoi groupé, privés par nature) ou quitter le groupe ;
--  - mise à jour en direct : table de signaux sans contenu (com_signaux) diffusée par Supabase Realtime, lisible
--    seulement par les participants du fil.

update storage.buckets set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  file_size_limit = 10485760
where id = 'messagerie';

alter table public.com_messages add column if not exists pj jsonb not null default '[]'::jsonb;
alter table public.com_messages drop constraint if exists com_messages_texte_check;
alter table public.com_messages add constraint com_messages_texte_check check (length(texte) <= 10000);

-- Signaux de mise à jour (« ce fil a bougé ») pour le temps réel.
create table if not exists public.com_signaux (
  fil_id uuid primary key references public.com_fils(id) on delete cascade,
  maj timestamptz not null default now()
);
alter table public.com_signaux enable row level security;
revoke all on public.com_signaux from anon;
grant select on public.com_signaux to authenticated;

create or replace function public.com_peut_voir(p_fil uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from com_participants p where p.fil_id = p_fil and p.boite_id in (select public.com_mes_boites()));
$$;
drop policy if exists com_signaux_lecture on public.com_signaux;
create policy com_signaux_lecture on public.com_signaux for select to authenticated using (public.com_peut_voir(fil_id));

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'com_signaux') then
    alter publication supabase_realtime add table public.com_signaux;
  end if;
end $$;

create or replace function public.com_signaler_maj(p_fil uuid) returns void
language sql security definer set search_path = public as $$
  -- Fil en cours de suppression (cascade) : rien à signaler.
  insert into com_signaux (fil_id, maj) select p_fil, now() where exists (select 1 from com_fils where id = p_fil)
  on conflict (fil_id) do update set maj = now();
$$;
create or replace function public.com_signal_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.com_signaler_maj(case when tg_op = 'DELETE' then old.fil_id else new.fil_id end);
  return null;
end;
$$;
drop trigger if exists com_messages_signal on public.com_messages;
create trigger com_messages_signal after insert or update on public.com_messages for each row execute function public.com_signal_message();
drop trigger if exists com_participants_signal on public.com_participants;
create trigger com_participants_signal after insert or delete on public.com_participants for each row execute function public.com_signal_message();

-- Pièces jointes : contrôle des chemins cités par un message (dossier de la boîte qui envoie).
create or replace function public.com_pj_valides(p_boite uuid, p_pj jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare x jsonb;
begin
  if p_pj is null or jsonb_typeof(p_pj) <> 'array' then return '[]'::jsonb; end if;
  if jsonb_array_length(p_pj) > 10 then raise exception 'Dix pièces jointes au plus par message'; end if;
  for x in select * from jsonb_array_elements(p_pj) loop
    if coalesce(x->>'path', '') not like p_boite::text || '/%' then raise exception 'Pièce jointe non autorisée'; end if;
  end loop;
  return p_pj;
end;
$$;

drop policy if exists "com pj depot" on storage.objects;
create policy "com pj depot" on storage.objects for insert to authenticated
  with check (bucket_id = 'messagerie' and (storage.foldername(name))[1] in (select x::text from public.com_mes_boites() x));
drop policy if exists "com pj lecture" on storage.objects;
create policy "com pj lecture" on storage.objects for select to authenticated
  using (bucket_id = 'messagerie' and (
    (storage.foldername(name))[1] in (select x::text from public.com_mes_boites() x)
    or exists (select 1 from public.com_messages m join public.com_participants p on p.fil_id = m.fil_id
                where m.pj @> jsonb_build_array(jsonb_build_object('path', name))
                  and p.boite_id in (select public.com_mes_boites()))));

-- Fils : informations de groupe en plus (nombre de participants, créateur, envoi groupé).
drop function if exists public.com_fils_de(uuid);
create function public.com_fils_de(p_boite uuid)
returns table (id uuid, sujet text, participants text, nb_participants integer, dernier_le timestamptz, apercu text, non_lu boolean,
               signale boolean, entre_familles boolean, cree_par_moi boolean, envoi_groupe boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.com_verifier(p_boite);
  return query
  select f.id, f.sujet,
         (select string_agg(b.libelle, ', ' order by b.ordre, b.libelle) from com_participants q join com_boites b on b.id = q.boite_id
           where q.fil_id = f.id and q.boite_id <> p_boite),
         (select count(*)::int from com_participants q where q.fil_id = f.id),
         f.dernier_le,
         (select case when m.masque_le is not null then 'Message masqué par la Direction'
                      else coalesce(nullif(left(m.texte, 140), ''), '') || case when jsonb_array_length(m.pj) > 0 then ' 📎 ' || jsonb_array_length(m.pj) else '' end end
            from com_messages m where m.fil_id = f.id order by m.created_at desc limit 1),
         exists (select 1 from com_messages m where m.fil_id = f.id and m.boite_id <> p_boite and m.masque_le is null
                  and m.created_at > coalesce(p.lu_le, '-infinity'::timestamptz)),
         f.signale_le is not null,
         not exists (select 1 from com_participants q join com_boites b on b.id = q.boite_id
                      where q.fil_id = f.id and b.service is not null),
         f.cree_par = p_boite,
         f.envoi is not null
    from com_participants p join com_fils f on f.id = p.fil_id
   where p.boite_id = p_boite
   order by f.dernier_le desc;
end;
$$;

drop function if exists public.com_messages_de(uuid, uuid);
create function public.com_messages_de(p_fil uuid, p_boite uuid)
returns table (id uuid, auteur text, de_moi boolean, texte text, pj jsonb, masque boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_dir boolean := exists (select 1 from com_boites x where x.id = p_boite and x.service = 'direction');
begin
  perform public.com_verifier(p_boite);
  if not exists (select 1 from com_participants cp where cp.fil_id = p_fil and cp.boite_id = p_boite) then raise exception 'Fil inconnu'; end if;
  return query
  select m.id, b.libelle, m.boite_id = p_boite,
         case when m.masque_le is null or v_dir then m.texte else null end,
         case when m.masque_le is null or v_dir then m.pj else '[]'::jsonb end,
         m.masque_le is not null, m.created_at
    from com_messages m join com_boites b on b.id = m.boite_id
   where m.fil_id = p_fil
   order by m.created_at;
end;
$$;

drop function if exists public.com_nouveau_fil(uuid, uuid[], text, text);
create function public.com_nouveau_fil(p_boite uuid, p_destinataires uuid[], p_sujet text, p_texte text, p_pj jsonb default '[]'::jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_fil uuid; v_pj jsonb := public.com_pj_valides(p_boite, p_pj);
begin
  perform public.com_verifier(p_boite);
  if coalesce(btrim(p_sujet), '') = '' then raise exception 'Le sujet est obligatoire'; end if;
  if coalesce(array_length(p_destinataires, 1), 0) = 0 then raise exception 'Choisissez au moins un destinataire'; end if;
  if coalesce(btrim(p_texte), '') = '' and jsonb_array_length(v_pj) = 0 then raise exception 'Le message est vide'; end if;
  if exists (select 1 from unnest(p_destinataires) d where d not in (select a.id from public.com_annuaire() a)) then
    raise exception 'Destinataire non autorisé';
  end if;
  insert into com_fils (sujet, cree_par) values (btrim(p_sujet), p_boite) returning id into v_fil;
  insert into com_participants (fil_id, boite_id, lu_le)
    select v_fil, d, null from (select distinct unnest(p_destinataires) d) x where d <> p_boite;
  insert into com_participants (fil_id, boite_id, lu_le) values (v_fil, p_boite, now());
  insert into com_messages (fil_id, boite_id, texte, pj) values (v_fil, p_boite, btrim(coalesce(p_texte, '')), v_pj);
  return v_fil;
end;
$$;

drop function if exists public.com_repondre(uuid, uuid, text);
create function public.com_repondre(p_fil uuid, p_boite uuid, p_texte text, p_pj jsonb default '[]'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_pj jsonb := public.com_pj_valides(p_boite, p_pj);
begin
  perform public.com_verifier(p_boite);
  if not exists (select 1 from com_participants where fil_id = p_fil and boite_id = p_boite) then raise exception 'Fil inconnu'; end if;
  if coalesce(btrim(p_texte), '') = '' and jsonb_array_length(v_pj) = 0 then raise exception 'Le message est vide'; end if;
  insert into com_messages (fil_id, boite_id, texte, pj) values (p_fil, p_boite, btrim(coalesce(p_texte, '')), v_pj);
  update com_fils set dernier_le = now() where id = p_fil;
  update com_participants set lu_le = now() where fil_id = p_fil and boite_id = p_boite;
end;
$$;

-- Groupes : ajouter des membres, quitter, renommer.
create or replace function public.com_ajouter(p_fil uuid, p_boite uuid, p_destinataires uuid[]) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  perform public.com_verifier(p_boite);
  if not exists (select 1 from com_participants where fil_id = p_fil and boite_id = p_boite) then raise exception 'Fil inconnu'; end if;
  if exists (select 1 from com_fils where id = p_fil and envoi is not null) then raise exception 'Un envoi groupé reste privé : écrivez un nouveau message.'; end if;
  if exists (select 1 from unnest(p_destinataires) d where d not in (select a.id from public.com_annuaire() a)) then
    raise exception 'Destinataire non autorisé';
  end if;
  insert into com_participants (fil_id, boite_id) select p_fil, d from (select distinct unnest(p_destinataires) d) x
  on conflict do nothing;
  get diagnostics n = row_count;
  update com_fils set dernier_le = now() where id = p_fil;
  return n;
end;
$$;

create or replace function public.com_quitter(p_fil uuid, p_boite uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.com_verifier(p_boite);
  delete from com_participants where fil_id = p_fil and boite_id = p_boite;
end;
$$;

create or replace function public.com_renommer(p_fil uuid, p_boite uuid, p_sujet text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.com_verifier(p_boite);
  if coalesce(btrim(p_sujet), '') = '' then raise exception 'Le sujet est obligatoire'; end if;
  update com_fils set sujet = btrim(p_sujet) where id = p_fil and cree_par = p_boite;
  if not found then raise exception 'Seul le créateur du fil peut le renommer'; end if;
  perform public.com_signaler_maj(p_fil);
end;
$$;

/** Participants d'un fil (pour la gestion du groupe). */
create or replace function public.com_participants_de(p_fil uuid, p_boite uuid) returns table (id uuid, libelle text, service text, moi boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.com_verifier(p_boite);
  if not exists (select 1 from com_participants cp where cp.fil_id = p_fil and cp.boite_id = p_boite) then raise exception 'Fil inconnu'; end if;
  return query select b.id, b.libelle, b.service, b.id = p_boite from com_participants q join com_boites b on b.id = q.boite_id
    where q.fil_id = p_fil order by b.service is null, b.ordre, b.libelle;
end;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'com_peut_voir(uuid)', 'com_pj_valides(uuid, jsonb)', 'com_fils_de(uuid)', 'com_messages_de(uuid, uuid)',
    'com_nouveau_fil(uuid, uuid[], text, text, jsonb)', 'com_repondre(uuid, uuid, text, jsonb)', 'com_ajouter(uuid, uuid, uuid[])',
    'com_quitter(uuid, uuid)', 'com_renommer(uuid, uuid, text)', 'com_participants_de(uuid, uuid)']
  loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
revoke all on function public.com_signaler_maj(uuid), public.com_signal_message() from public, anon, authenticated;
