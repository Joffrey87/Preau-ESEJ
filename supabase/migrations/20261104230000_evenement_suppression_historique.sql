-- Événementiel : suppression d'une dépense ou d'un événement, demandes de suppression au Trésorier,
-- historique des actions (avec annulation). Migration additive.

-- 1. Responsables de l'Événementiel (seuls à pouvoir supprimer un événement entier).
alter table public.evenement_membres add column if not exists responsable boolean not null default false;
update public.evenement_membres set responsable = true
 where id in ('728ad939-b2ed-40e6-94f8-d7565e1b3803', '8759d1b7-e2d3-4d37-b8fe-5feca219c5d8', '4f4abf9e-5dbd-4333-9a42-407137e6877c');

create or replace function public.est_responsable_evenement()
returns boolean language sql stable security definer set search_path = public as $$
  select public.est_evenement()
     and exists (select 1 from evenement_membres m where m.user_id = auth.uid() and m.responsable and m.actif);
$$;

create or replace function public.qui_evenement()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select libelle from evenement_membres where user_id = auth.uid() limit 1),
                  (select case role when 'tresorier' then 'Trésorier' when 'president' then 'Président'
                                    when 'administrateur' then 'Administrateur' when 'directrice' then 'Directrice' else role end
                     from profils where id = auth.uid()),
                  'Préau');
$$;

-- 2. Garde-fous de suppression (politiques restrictives : s'ajoutent aux politiques existantes).
drop policy if exists evenements_caisse_suppression_responsable on public.evenements_caisse;
create policy evenements_caisse_suppression_responsable on public.evenements_caisse as restrictive for delete
  using (public.est_tresorier() or public.est_responsable_evenement());

drop policy if exists factures_fournisseurs_suppression_non_liee on public.factures_fournisseurs;
create policy factures_fournisseurs_suppression_non_liee on public.factures_fournisseurs as restrictive for delete
  using (public.est_tresorier() or public.est_tresorier_factures() or (operation_id is null and caisse_mouvement_id is null));

-- 3. Historique des actions de l'Événementiel.
create table if not exists public.evenement_historique (
  id bigserial primary key,
  table_nom text not null check (table_nom in ('evenements_caisse', 'factures_fournisseurs', 'evenement_recettes')),
  ligne_id uuid not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  avant jsonb,
  apres jsonb,
  par uuid default auth.uid(),
  par_libelle text,
  le timestamptz not null default now(),
  lot uuid,
  annulation_de bigint references public.evenement_historique(id) on delete set null,
  annule_le timestamptz,
  annule_par text
);
create index if not exists evenement_historique_le on public.evenement_historique (le desc);
create index if not exists evenement_historique_lot on public.evenement_historique (lot);
alter table public.evenement_historique enable row level security;
drop policy if exists evenement_historique_lecture on public.evenement_historique;
create policy evenement_historique_lecture on public.evenement_historique for select
  using (public.est_evenement() or public.est_tresorier());
grant select on public.evenement_historique to authenticated;

create or replace function public.evenement_historique_noter()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_avant jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
        v_apres jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  if tg_table_name = 'factures_fournisseurs'
     and coalesce(v_avant->>'domaine', '') <> 'evenement' and coalesce(v_apres->>'domaine', '') <> 'evenement' then
    return null;
  end if;
  if tg_op = 'UPDATE' and v_avant = v_apres then return null; end if;
  insert into evenement_historique (table_nom, ligne_id, action, avant, apres, par_libelle, lot, annulation_de)
  values (tg_table_name, coalesce(v_apres->>'id', v_avant->>'id')::uuid, tg_op, v_avant, v_apres, public.qui_evenement(),
          nullif(current_setting('preau.lot', true), '')::uuid,
          nullif(current_setting('preau.annulation_de', true), '')::bigint);
  return null;
end;
$$;

drop trigger if exists evenement_historique on public.evenements_caisse;
create trigger evenement_historique after insert or update or delete on public.evenements_caisse
  for each row execute function public.evenement_historique_noter();
drop trigger if exists evenement_historique on public.factures_fournisseurs;
create trigger evenement_historique after insert or update or delete on public.factures_fournisseurs
  for each row execute function public.evenement_historique_noter();
drop trigger if exists evenement_historique on public.evenement_recettes;
create trigger evenement_historique after insert or update or delete on public.evenement_recettes
  for each row execute function public.evenement_historique_noter();

-- 4. Suppression d'un événement entier (responsables, Trésorier). Les factures Événement rattachées sont supprimées,
--    les recettes partent en cascade. Refus si une facture ou une recette est liée à la banque ou à la caisse.
--    Renvoie les fichiers de factures à effacer du stockage.
create or replace function public.evenement_supprimer_interne(p_id uuid)
returns text[] language plpgsql security definer set search_path = public as $$
declare v_fichiers text[];
begin
  perform set_config('preau.lot', coalesce(nullif(current_setting('preau.lot', true), ''), gen_random_uuid()::text), true);
  select coalesce(array_agg(fichier) filter (where fichier is not null), '{}') into v_fichiers
    from factures_fournisseurs where evenement_id = p_id and domaine = 'evenement';
  delete from factures_fournisseurs where evenement_id = p_id and domaine = 'evenement';
  delete from evenements_caisse where id = p_id;
  return v_fichiers;
end;
$$;
revoke all on function public.evenement_supprimer_interne(uuid) from public, anon, authenticated;

create or replace function public.evenement_liens_bancaires(p_id uuid)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct x), '{}') from (
    select operation_id x from factures_fournisseurs where evenement_id = p_id and domaine = 'evenement' and operation_id is not null
    union all select operation_id from evenement_recettes where evenement_id = p_id and operation_id is not null) s;
$$;

create or replace function public.evenement_supprimer(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not (public.est_responsable_evenement() or public.est_tresorier()) then
    raise exception 'Seules les responsables de l''Événementiel peuvent supprimer un événement : faites une demande de suppression.';
  end if;
  if not exists (select 1 from evenements_caisse where id = p_id) then raise exception 'Événement introuvable.'; end if;
  if not public.est_tresorier() and (
       cardinality(public.evenement_liens_bancaires(p_id)) > 0
       or exists (select 1 from factures_fournisseurs where evenement_id = p_id and domaine = 'evenement' and caisse_mouvement_id is not null)) then
    raise exception 'Une dépense ou une recette de cet événement est liée à une opération bancaire ou de caisse : faites une demande de suppression au Trésorier.';
  end if;
  return jsonb_build_object('fichiers', to_jsonb(public.evenement_supprimer_interne(p_id)));
end;
$$;
grant execute on function public.evenement_supprimer(uuid) to authenticated;
grant execute on function public.evenement_liens_bancaires(uuid) to authenticated;
grant execute on function public.est_responsable_evenement() to authenticated;

-- 5. Demandes de suppression (dépense liée à la banque, ou événement par une non-responsable).
create table if not exists public.demandes_suppression (
  id uuid primary key default gen_random_uuid(),
  cible text not null check (cible in ('facture', 'evenement')),
  cible_id uuid not null,
  libelle text not null,
  operations uuid[] not null default '{}',
  motif text,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'acceptee', 'refusee')),
  fil_id uuid references public.com_fils(id) on delete set null,
  demande_par uuid default auth.uid(),
  demande_par_libelle text,
  demande_le timestamptz not null default now(),
  traite_par text,
  traite_le timestamptz
);
create unique index if not exists demandes_suppression_une_en_attente on public.demandes_suppression (cible, cible_id) where statut = 'en_attente';
alter table public.demandes_suppression enable row level security;
drop policy if exists demandes_suppression_lecture on public.demandes_suppression;
create policy demandes_suppression_lecture on public.demandes_suppression for select
  using (public.est_evenement() or public.est_tresorier());
grant select on public.demandes_suppression to authenticated;

create or replace function public.demander_suppression(p_cible text, p_id uuid, p_motif text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_lib text; v_ops uuid[]; v_fil uuid; v_id uuid; v_evt uuid; v_tres uuid; v_qui text := public.qui_evenement(); v_texte text;
begin
  if not (public.est_evenement() or public.est_tresorier()) then raise exception 'Action non autorisée.'; end if;
  if p_cible = 'facture' then
    select coalesce(f.libelle, f.numero, 'Dépense') || coalesce(' · ' || to_char(f.montant, 'FM999990D00') || ' €', '') || coalesce(' · ' || to_char(f.date, 'DD/MM/YYYY'), ''),
           case when f.operation_id is null then '{}'::uuid[] else array[f.operation_id] end
      into v_lib, v_ops from factures_fournisseurs f where f.id = p_id and f.domaine = 'evenement';
  elsif p_cible = 'evenement' then
    select coalesce(e.nom, 'Événement') || coalesce(' · ' || to_char(e.date, 'DD/MM/YYYY'), ''), public.evenement_liens_bancaires(e.id)
      into v_lib, v_ops from evenements_caisse e where e.id = p_id;
  else
    raise exception 'Demande inconnue.';
  end if;
  if v_lib is null then raise exception 'Élément introuvable.'; end if;
  if exists (select 1 from demandes_suppression where cible = p_cible and cible_id = p_id and statut = 'en_attente') then
    raise exception 'Une demande de suppression est déjà en attente pour cet élément.';
  end if;

  select id into v_evt from com_boites where service = 'evenementiel';
  select id into v_tres from com_boites where service = 'tresorerie';
  v_texte := v_qui || ' demande la suppression ' || case when p_cible = 'facture' then 'de la dépense' else 'de l''événement' end
             || ' « ' || v_lib || ' ».'
             || case when cardinality(v_ops) > 0 then E'\nElle est liée à une opération bancaire : la ligne est signalée en ambre dans la Comptabilité.' else '' end
             || case when coalesce(btrim(p_motif), '') <> '' then E'\nMotif : ' || btrim(p_motif) else '' end
             || E'\nVous pouvez accepter ou refuser la demande depuis la Comptabilité.';
  if v_evt is not null and v_tres is not null then
    insert into com_fils (sujet, cree_par) values ('Demande de suppression : ' || left(v_lib, 120), v_evt) returning id into v_fil;
    insert into com_participants (fil_id, boite_id, lu_le) values (v_fil, v_tres, null), (v_fil, v_evt, now());
    insert into com_messages (fil_id, boite_id, texte, pj) values (v_fil, v_evt, v_texte, '[]'::jsonb);
  end if;

  insert into demandes_suppression (cible, cible_id, libelle, operations, motif, fil_id, demande_par_libelle)
  values (p_cible, p_id, v_lib, v_ops, nullif(btrim(p_motif), ''), v_fil, v_qui) returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.demander_suppression(text, uuid, text) to authenticated;

create or replace function public.traiter_demande_suppression(p_id uuid, p_accepter boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d demandes_suppression; v_fichiers text[] := '{}'; v_qui text := public.qui_evenement(); v_boite uuid; v_f text;
begin
  select * into d from demandes_suppression where id = p_id for update;
  if d.id is null then raise exception 'Demande introuvable.'; end if;
  if d.statut <> 'en_attente' then raise exception 'Demande déjà traitée.'; end if;
  if not (public.est_tresorier()
          or (d.cible = 'evenement' and cardinality(d.operations) = 0 and public.est_responsable_evenement())) then
    raise exception 'Seul le Trésorier peut traiter cette demande.';
  end if;
  if p_accepter then
    if d.cible = 'facture' then
      select fichier into v_f from factures_fournisseurs where id = d.cible_id;
      perform set_config('preau.lot', gen_random_uuid()::text, true);
      delete from factures_fournisseurs where id = d.cible_id;
      if v_f is not null then v_fichiers := array[v_f]; end if;
    else
      v_fichiers := public.evenement_supprimer_interne(d.cible_id);
    end if;
  end if;
  update demandes_suppression set statut = case when p_accepter then 'acceptee' else 'refusee' end,
         traite_par = v_qui, traite_le = now() where id = p_id;
  if d.fil_id is not null then
    select id into v_boite from com_boites where service = case when public.est_tresorier() then 'tresorerie' else 'evenementiel' end;
    if v_boite is not null and exists (select 1 from com_participants where fil_id = d.fil_id and boite_id = v_boite) then
      insert into com_messages (fil_id, boite_id, texte, pj)
      values (d.fil_id, v_boite, case when p_accepter then 'Demande acceptée : « ' || d.libelle || ' » a été supprimé(e).'
                                      else 'Demande refusée : « ' || d.libelle || ' » est conservé(e).' end, '[]'::jsonb);
      update com_fils set dernier_le = now() where id = d.fil_id;
      update com_participants set lu_le = now() where fil_id = d.fil_id and boite_id = v_boite;
    end if;
  end if;
  return jsonb_build_object('fichiers', to_jsonb(v_fichiers));
end;
$$;
grant execute on function public.traiter_demande_suppression(uuid, boolean) to authenticated;

-- 6. Annulation d'une action de l'historique (et de tout son lot : suppression d'un événement entier, par exemple).
create or replace function public.historique_annuler(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h evenement_historique; e evenement_historique; v_courant jsonb; v_cols text; v_lot uuid := gen_random_uuid(); v_sans_fichier int := 0;
begin
  if not (public.est_evenement() or public.est_tresorier()) then raise exception 'Action non autorisée.'; end if;
  select * into h from evenement_historique where id = p_id;
  if h.id is null then raise exception 'Action introuvable.'; end if;
  perform set_config('preau.lot', v_lot::text, true);
  perform set_config('preau.annulation_de', h.id::text, true);

  for e in select * from evenement_historique
            where (h.lot is not null and lot = h.lot) or id = h.id
            order by case when action = 'DELETE' and table_nom = 'evenements_caisse' then 0 else 1 end, id desc
  loop
    if e.annule_le is not null then raise exception 'Cette action a déjà été annulée.'; end if;
    execute format('select to_jsonb(t) from public.%I t where id = $1', e.table_nom) into v_courant using e.ligne_id;
    select string_agg(format('%I', column_name), ', ') into v_cols
      from information_schema.columns where table_schema = 'public' and table_name = e.table_nom;

    if e.action = 'DELETE' then
      if v_courant is not null then raise exception 'Impossible d''annuler : l''élément existe de nouveau.'; end if;
      if e.avant->>'operation_id' is not null then
        raise exception 'Impossible d''annuler : l''élément supprimé était lié à une opération bancaire.';
      end if;
      if e.table_nom = 'factures_fournisseurs' and e.avant->>'fichier' is not null
         and not exists (select 1 from storage.objects o where o.bucket_id = 'factures-fournisseurs' and o.name = e.avant->>'fichier') then
        e.avant := jsonb_set(e.avant, '{fichier}', 'null'::jsonb);
        v_sans_fichier := v_sans_fichier + 1;
      end if;
      begin
        execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1)', e.table_nom, v_cols) using e.avant;
      exception when foreign_key_violation then
        raise exception 'Impossible d''annuler : l''événement ou le fournisseur de cet élément n''existe plus (annulez d''abord sa suppression).';
      end;
    else
      if v_courant is null then raise exception 'Impossible d''annuler : l''élément a été supprimé depuis.'; end if;
      if v_courant is distinct from e.apres then
        raise exception 'Impossible d''annuler : l''élément a été modifié depuis (annulez d''abord les actions plus récentes).';
      end if;
      if v_courant->>'operation_id' is not null or (e.action = 'UPDATE' and e.avant->>'operation_id' is not null) then
        raise exception 'Impossible d''annuler : l''élément est lié à une opération bancaire.';
      end if;
      if e.action = 'INSERT' then
        if e.table_nom = 'evenements_caisse' then
          if not (public.est_responsable_evenement() or public.est_tresorier()) then
            raise exception 'Seules les responsables peuvent supprimer un événement.';
          end if;
          if exists (select 1 from factures_fournisseurs where evenement_id = e.ligne_id)
             or exists (select 1 from evenement_recettes where evenement_id = e.ligne_id) then
            raise exception 'Impossible d''annuler : des dépenses ou des recettes ont été ajoutées à cet événement depuis.';
          end if;
        end if;
        execute format('delete from public.%I where id = $1', e.table_nom) using e.ligne_id;
      else
        execute format('update public.%1$I t set (%2$s) = (select %2$s from jsonb_populate_record(null::public.%1$I, $1)) where id = $2',
                       e.table_nom, v_cols) using e.avant, e.ligne_id;
      end if;
    end if;
    update evenement_historique set annule_le = now(), annule_par = public.qui_evenement() where id = e.id;
  end loop;
  perform set_config('preau.annulation_de', '', true);
  return jsonb_build_object('sans_fichier', v_sans_fichier);
end;
$$;
grant execute on function public.historique_annuler(bigint) to authenticated;
