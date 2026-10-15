-- 15/10/2026 — Onglet « Communication » : messagerie entre les familles et l'école (Direction, Secrétariat, Trésorerie,
-- Événementiel), et entre familles.
--  - une « boîte » par famille et par service ; chacun écrit au nom de la boîte qu'il tient (mes_boites) ;
--  - fils de discussion à plusieurs participants (boîtes), lus/non lus par participant ;
--  - envoi groupé d'un service (toutes les familles, ou celles d'une classe) : un fil par famille, réponse privée ;
--  - modération : un fil entre familles peut être signalé à la Direction, qui le voit alors et peut masquer un message ;
--  - alerte : pastille « non lus » dans Préau (aucun courriel envoyé).
-- Tables sans politique : tout passe par les fonctions ci-dessous (security definer), qui vérifient la boîte.

-- Année scolaire en cours (« 2026-2027 ») : bascule au 1er août.
create or replace function public.com_annee_courante() returns text
language sql stable set search_path = public as $$
  select case when extract(month from current_date) >= 8
              then extract(year from current_date)::int || '-' || (extract(year from current_date)::int + 1)
              else (extract(year from current_date)::int - 1) || '-' || extract(year from current_date)::int end;
$$;

create table if not exists public.com_boites (
  id uuid primary key default gen_random_uuid(),
  famille_id uuid unique references public.familles(id) on delete cascade,
  service text unique check (service in ('direction', 'secretariat', 'tresorerie', 'evenementiel')),
  libelle text not null,
  ordre smallint not null default 100,
  check ((famille_id is null) <> (service is null))
);

insert into public.com_boites (service, libelle, ordre) values
  ('direction', 'Direction de l''école', 1),
  ('secretariat', 'Secrétariat', 2),
  ('tresorerie', 'Trésorerie', 3),
  ('evenementiel', 'Événementiel', 4)
on conflict (service) do nothing;
insert into public.com_boites (famille_id, libelle)
  select f.id, 'Famille ' || f.nom from public.familles f
  on conflict (famille_id) do nothing;

-- Toute nouvelle famille reçoit sa boîte ; un nom modifié suit.
create or replace function public.com_boite_famille_maj() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into com_boites (famille_id, libelle) values (new.id, 'Famille ' || new.nom)
  on conflict (famille_id) do update set libelle = excluded.libelle;
  return new;
end;
$$;
drop trigger if exists com_boite_famille on public.familles;
create trigger com_boite_famille after insert or update of nom on public.familles
  for each row execute function public.com_boite_famille_maj();

create table if not exists public.com_fils (
  id uuid primary key default gen_random_uuid(),
  sujet text not null,
  cree_par uuid not null references public.com_boites(id) on delete cascade,
  /** Envoi groupé d'origine (même valeur pour tous les fils d'un envoi). */
  envoi uuid,
  signale_le timestamptz,
  created_at timestamptz not null default now(),
  dernier_le timestamptz not null default now()
);
create table if not exists public.com_participants (
  fil_id uuid not null references public.com_fils(id) on delete cascade,
  boite_id uuid not null references public.com_boites(id) on delete cascade,
  lu_le timestamptz,
  primary key (fil_id, boite_id)
);
create index if not exists com_participants_boite on public.com_participants (boite_id);
create table if not exists public.com_messages (
  id uuid primary key default gen_random_uuid(),
  fil_id uuid not null references public.com_fils(id) on delete cascade,
  boite_id uuid not null references public.com_boites(id) on delete cascade,
  auteur uuid default auth.uid(),
  texte text not null check (length(btrim(texte)) > 0 and length(texte) <= 10000),
  masque_le timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists com_messages_fil on public.com_messages (fil_id, created_at);

alter table public.com_boites enable row level security;
alter table public.com_fils enable row level security;
alter table public.com_participants enable row level security;
alter table public.com_messages enable row level security;
revoke all on public.com_boites, public.com_fils, public.com_participants, public.com_messages from anon, authenticated;

-- Boîtes tenues par le compte connecté.
create or replace function public.com_mes_boites() returns setof uuid
language sql stable security definer set search_path = public as $$
  select b.id from com_boites b
   where (b.famille_id is not null and b.famille_id = public.ma_famille())
      or (b.service = 'direction' and public.mon_role() = 'directrice')
      or (b.service = 'secretariat' and public.mon_role() = 'secretaire')
      or (b.service = 'tresorerie' and public.mon_role() in ('tresorier', 'administrateur'))
      or (b.service = 'evenementiel' and public.mon_role() = 'evenement');
$$;

create or replace function public.com_verifier(p_boite uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_boite is null or not exists (select 1 from public.com_mes_boites() x where x = p_boite) then
    raise exception 'Messagerie : boîte non autorisée';
  end if;
end;
$$;

/** Mes boîtes, avec leur nombre de fils non lus. */
create or replace function public.com_boites_moi() returns table (id uuid, libelle text, service text, non_lus integer)
language sql stable security definer set search_path = public as $$
  select b.id, b.libelle, b.service,
         (select count(*)::int from com_participants p join com_fils f on f.id = p.fil_id
           where p.boite_id = b.id
             and exists (select 1 from com_messages m where m.fil_id = f.id and m.boite_id <> b.id and m.masque_le is null
                          and m.created_at > coalesce(p.lu_le, '-infinity'::timestamptz)))
    from com_boites b where b.id in (select public.com_mes_boites())
   order by b.ordre, b.libelle;
$$;

/** Total des fils non lus du compte (pastille du menu). */
create or replace function public.com_non_lus() returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum(non_lus), 0)::int from public.com_boites_moi();
$$;

/** Destinataires possibles : les services, et les familles ayant un enfant en classe cette année (ou plus tard). */
create or replace function public.com_annuaire() returns table (id uuid, libelle text, service text)
language sql stable security definer set search_path = public as $$
  select b.id, b.libelle, b.service from com_boites b
   where exists (select 1 from public.com_mes_boites())
     and b.id not in (select public.com_mes_boites())
     and (b.service is not null
          or exists (select 1 from eleves e join classe_eleves ce on ce.eleve_id = e.id join classes c on c.id = ce.classe_id
                      where e.famille_id = b.famille_id and c.annee_scolaire >= public.com_annee_courante()))
   order by b.service is null, b.ordre, b.libelle;
$$;

/** Fils d'une boîte, du plus récent au plus ancien. */
create or replace function public.com_fils_de(p_boite uuid)
returns table (id uuid, sujet text, participants text, dernier_le timestamptz, apercu text, non_lu boolean, signale boolean, entre_familles boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.com_verifier(p_boite);
  return query
  select f.id, f.sujet,
         (select string_agg(b.libelle, ', ' order by b.ordre, b.libelle) from com_participants q join com_boites b on b.id = q.boite_id
           where q.fil_id = f.id and q.boite_id <> p_boite),
         f.dernier_le,
         (select case when m.masque_le is not null then 'Message masqué par la Direction' else left(m.texte, 140) end
            from com_messages m where m.fil_id = f.id order by m.created_at desc limit 1),
         exists (select 1 from com_messages m where m.fil_id = f.id and m.boite_id <> p_boite and m.masque_le is null
                  and m.created_at > coalesce(p.lu_le, '-infinity'::timestamptz)),
         f.signale_le is not null,
         not exists (select 1 from com_participants q join com_boites b on b.id = q.boite_id
                      where q.fil_id = f.id and b.service is not null)
    from com_participants p join com_fils f on f.id = p.fil_id
   where p.boite_id = p_boite
   order by f.dernier_le desc;
end;
$$;

/** Messages d'un fil (la boîte doit y participer). */
create or replace function public.com_messages_de(p_fil uuid, p_boite uuid)
returns table (id uuid, auteur text, de_moi boolean, texte text, masque boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.com_verifier(p_boite);
  if not exists (select 1 from com_participants cp where cp.fil_id = p_fil and cp.boite_id = p_boite) then raise exception 'Fil inconnu'; end if;
  return query
  select m.id, b.libelle, m.boite_id = p_boite,
         case when m.masque_le is null or p_boite = (select x.id from com_boites x where x.service = 'direction') then m.texte else null end,
         m.masque_le is not null, m.created_at
    from com_messages m join com_boites b on b.id = m.boite_id
   where m.fil_id = p_fil
   order by m.created_at;
end;
$$;

create or replace function public.com_lu(p_fil uuid, p_boite uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.com_verifier(p_boite);
  update com_participants set lu_le = now() where fil_id = p_fil and boite_id = p_boite;
end;
$$;

/** Nouveau fil vers une ou plusieurs boîtes. */
create or replace function public.com_nouveau_fil(p_boite uuid, p_destinataires uuid[], p_sujet text, p_texte text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_fil uuid;
begin
  perform public.com_verifier(p_boite);
  if coalesce(btrim(p_sujet), '') = '' then raise exception 'Le sujet est obligatoire'; end if;
  if coalesce(array_length(p_destinataires, 1), 0) = 0 then raise exception 'Choisissez au moins un destinataire'; end if;
  if exists (select 1 from unnest(p_destinataires) d where d not in (select a.id from public.com_annuaire() a)) then
    raise exception 'Destinataire non autorisé';
  end if;
  insert into com_fils (sujet, cree_par) values (btrim(p_sujet), p_boite) returning id into v_fil;
  insert into com_participants (fil_id, boite_id, lu_le)
    select v_fil, d, null from (select distinct unnest(p_destinataires) d) x where d <> p_boite;
  insert into com_participants (fil_id, boite_id, lu_le) values (v_fil, p_boite, now());
  insert into com_messages (fil_id, boite_id, texte) values (v_fil, p_boite, btrim(p_texte));
  return v_fil;
end;
$$;

create or replace function public.com_repondre(p_fil uuid, p_boite uuid, p_texte text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.com_verifier(p_boite);
  if not exists (select 1 from com_participants where fil_id = p_fil and boite_id = p_boite) then raise exception 'Fil inconnu'; end if;
  insert into com_messages (fil_id, boite_id, texte) values (p_fil, p_boite, btrim(p_texte));
  update com_fils set dernier_le = now() where id = p_fil;
  update com_participants set lu_le = now() where fil_id = p_fil and boite_id = p_boite;
end;
$$;

/**
 * Envoi groupé d'un service : un fil par famille (réponse privée). p_classe null = toutes les familles ayant un enfant
 * en classe cette année ; sinon, les familles des élèves de cette classe. Renvoie le nombre de familles.
 */
create or replace function public.com_envoi_groupe(p_boite uuid, p_classe uuid, p_sujet text, p_texte text) returns integer
language plpgsql security definer set search_path = public as $$
declare v_envoi uuid := gen_random_uuid(); v_fil uuid; r record; n integer := 0;
begin
  perform public.com_verifier(p_boite);
  if not exists (select 1 from com_boites where id = p_boite and service is not null) then raise exception 'Envoi groupé réservé aux services de l''école'; end if;
  if coalesce(btrim(p_sujet), '') = '' or coalesce(btrim(p_texte), '') = '' then raise exception 'Sujet et message obligatoires'; end if;
  for r in
    select distinct b.id from com_boites b join eleves e on e.famille_id = b.famille_id
      join classe_eleves ce on ce.eleve_id = e.id join classes c on c.id = ce.classe_id
     where (p_classe is null and c.annee_scolaire = public.com_annee_courante()) or c.id = p_classe
  loop
    insert into com_fils (sujet, cree_par, envoi) values (btrim(p_sujet), p_boite, v_envoi) returning id into v_fil;
    insert into com_participants (fil_id, boite_id, lu_le) values (v_fil, p_boite, now()), (v_fil, r.id, null);
    insert into com_messages (fil_id, boite_id, texte) values (v_fil, p_boite, btrim(p_texte));
    n := n + 1;
  end loop;
  return n;
end;
$$;

/** Classes de l'année, pour l'envoi groupé. */
create or replace function public.com_classes() returns table (id uuid, nom text)
language sql stable security definer set search_path = public as $$
  select c.id, c.nom from classes c
   where c.annee_scolaire = public.com_annee_courante()
     and exists (select 1 from public.com_mes_boites() x join com_boites b on b.id = x where b.service is not null)
   order by c.ordre, c.nom;
$$;

/** Un participant signale un fil : la Direction y est ajoutée et le voit. */
create or replace function public.com_signaler(p_fil uuid, p_boite uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.com_verifier(p_boite);
  if not exists (select 1 from com_participants where fil_id = p_fil and boite_id = p_boite) then raise exception 'Fil inconnu'; end if;
  update com_fils set signale_le = coalesce(signale_le, now()), dernier_le = now() where id = p_fil;
  insert into com_participants (fil_id, boite_id) select p_fil, id from com_boites where service = 'direction'
  on conflict do nothing;
end;
$$;

/** La Direction masque (ou rétablit) un message d'un fil auquel elle participe. */
create or replace function public.com_masquer(p_message uuid, p_masquer boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_dir uuid := (select id from com_boites where service = 'direction');
begin
  perform public.com_verifier(v_dir);
  if not exists (select 1 from com_messages m join com_participants p on p.fil_id = m.fil_id and p.boite_id = v_dir where m.id = p_message) then
    raise exception 'Message inconnu';
  end if;
  update com_messages set masque_le = case when p_masquer then now() else null end where id = p_message;
end;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'com_annee_courante()', 'com_mes_boites()', 'com_verifier(uuid)', 'com_boites_moi()', 'com_non_lus()', 'com_annuaire()', 'com_fils_de(uuid)',
    'com_messages_de(uuid, uuid)', 'com_lu(uuid, uuid)', 'com_nouveau_fil(uuid, uuid[], text, text)', 'com_repondre(uuid, uuid, text)',
    'com_envoi_groupe(uuid, uuid, text, text)', 'com_classes()', 'com_signaler(uuid, uuid)', 'com_masquer(uuid, boolean)']
  loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
revoke all on function public.com_boite_famille_maj() from public, anon, authenticated;
