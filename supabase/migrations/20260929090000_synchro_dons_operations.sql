-- Synchronisation d'un don et de l'opération comptable à laquelle il est relié.
--
-- Règles (trésorier, 28-29/09/2026) :
--  - la Comptabilité fait foi pour le MONTANT et la DATE D'ENCAISSEMENT ;
--    modifiés en Comptabilité, ils sont répercutés sur le don ; non modifiables
--    côté Dons ;
--  - date du don : virement / carte bancaire → date d'encaissement ; chèque /
--    espèces → date de réception (fiscalement, la remise ou la réception du
--    chèque, BOI-IR-RICI-250-30), jamais postérieure à l'encaissement ;
--  - mode de versement et exercice : synchronisés dans les deux sens
--    (prélèvement = virement ; Stripe / HelloAsso = carte bancaire) ;
--  - reçu fiscal établi : montant et date figés, des deux côtés ;
--  - une opération qui quitte la catégorie « Don » libère son don.
-- Les répercussions sont inscrites au journal de la comptabilité.

-- ---------------------------------------------------------------------------
-- 1. Vocabulaire des modes.
-- ---------------------------------------------------------------------------

update public.dons set mode_paiement = case
    when lower(mode_paiement) in ('virement', 'prelevement', 'prélèvement') then 'Virement'
    when lower(mode_paiement) in ('cheque', 'chèque') then 'Chèque'
    when lower(mode_paiement) in ('liquide', 'especes', 'espèces') then 'Espèces'
    when lower(mode_paiement) in ('stripe', 'virement ha', 'helloasso', 'cb', 'carte', 'carte bancaire') then 'Carte bancaire'
    else mode_paiement end
 where mode_paiement is not null;

/** Mode de la Comptabilité → mode de l'onglet Dons (null : pas d'équivalent). */
create or replace function public.mode_don_depuis_compta(m text)
returns text language sql immutable as $$
  select case lower(coalesce(m, ''))
    when 'virement' then 'Virement'
    when 'prelevement' then 'Virement'
    when 'cheque' then 'Chèque'
    when 'carte' then 'Carte bancaire'
    when 'especes' then 'Espèces'
    else null end
$$;

/** Mode de l'onglet Dons → mode de la Comptabilité ; un prélèvement reste un prélèvement. */
create or replace function public.mode_compta_depuis_don(m text, actuel text)
returns text language sql immutable as $$
  select case m
    when 'Virement' then case when actuel in ('virement', 'prelevement') then actuel else 'virement' end
    when 'Chèque' then 'cheque'
    when 'Carte bancaire' then 'carte'
    when 'Espèces' then 'especes'
    else null end
$$;

-- ---------------------------------------------------------------------------
-- 2. Complément des modes manquants sur les couples déjà reliés.
-- ---------------------------------------------------------------------------

update public.operations o
   set mode_paiement = public.mode_compta_depuis_don(d.mode_paiement, o.mode_paiement)
  from public.dons d
 where d.operation_id = o.id and d.supprime_le is null
   and o.mode_paiement is null
   and public.mode_compta_depuis_don(d.mode_paiement, null) is not null;

update public.dons d
   set mode_paiement = public.mode_don_depuis_compta(o.mode_paiement)
  from public.operations o
 where d.operation_id = o.id and d.supprime_le is null
   and d.mode_paiement is null
   and public.mode_don_depuis_compta(o.mode_paiement) is not null;

-- Libellé bancaire chiffré des opérations « Don » (les noms ne restent pas en clair).
alter table public.operations add column if not exists libelle_origine_chiffre text;
comment on column public.operations.libelle_origine_chiffre is
  'Libellés d''origine d''une opération « Don » (brut bancaire + libellé saisi), chiffrés avec le coffre : aucun nom de donateur en clair.';

-- ---------------------------------------------------------------------------
-- 3. Déclencheurs.
-- ---------------------------------------------------------------------------

create or replace function public.journal_synchro(p_op uuid, p_avant jsonb, p_apres jsonb, p_libelle text)
returns void language sql security invoker set search_path = public as $$
  insert into journal_operations (lot, libelle_lot, operation_id, action, avant, apres)
  values (gen_random_uuid(), p_libelle, p_op, 'modification', p_avant, p_apres)
$$;

/** Contrôles côté don : la Comptabilité fait foi, le reçu établi est figé. */
create or replace function public.dons_avant_maj()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  o record;
  direct boolean := pg_trigger_depth() = 1; -- modification saisie, pas une répercussion
begin
  if new.operation_id is null then return new; end if;
  select id, date_operation, montant, mode_paiement into o from operations where id = new.operation_id;
  if not found then return new; end if;

  -- Nouveau lien : le mode manquant est repris de la comptabilité.
  if old.operation_id is distinct from new.operation_id and new.mode_paiement is null then
    new.mode_paiement := mode_don_depuis_compta(o.mode_paiement);
  end if;

  if old.recu_numero ~ '^RE_' and new.recu_numero is not distinct from old.recu_numero
     and (new.montant <> old.montant or new.date_don <> old.date_don) then
    raise exception 'Reçu % établi : le montant et la date de ce don sont figés (annulez le reçu d''abord).', old.recu_numero;
  end if;

  if direct and old.operation_id is not distinct from new.operation_id then
    if new.montant <> old.montant then
      raise exception 'Le montant de ce don vient de la comptabilité : modifiez-le dans l''onglet Comptabilité.';
    end if;
    if new.date_don <> old.date_don then
      if coalesce(new.mode_paiement, '') not in ('Chèque', 'Espèces') then
        raise exception 'La date de ce don est sa date d''encaissement, fixée par la comptabilité.';
      elsif new.date_don > o.date_operation then
        raise exception 'La date de réception du don ne peut pas être postérieure à son encaissement (%).',
          to_char(o.date_operation, 'DD/MM/YYYY');
      end if;
    end if;
  end if;
  return new;
end $$;

/** Répercussions d'un don vers son opération : mode et exercice. */
create or replace function public.dons_apres_maj()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  o record;
  m text;
begin
  if pg_trigger_depth() > 1 or new.operation_id is null then return null; end if;
  select id, mode_paiement, exercice_id into o from operations where id = new.operation_id;
  if not found then return null; end if;

  m := mode_compta_depuis_don(new.mode_paiement, o.mode_paiement);
  if (new.mode_paiement is distinct from old.mode_paiement or old.operation_id is distinct from new.operation_id)
     and m is not null and m is distinct from o.mode_paiement then
    update operations set mode_paiement = m where id = o.id;
    perform journal_synchro(o.id, jsonb_build_object('mode_paiement', o.mode_paiement),
      jsonb_build_object('mode_paiement', m), 'Mode synchronisé depuis l''onglet Dons');
  end if;

  if new.exercice_id is distinct from old.exercice_id and new.exercice_id is not null
     and new.exercice_id is distinct from o.exercice_id then
    update operations set exercice_id = new.exercice_id where id = o.id;
    perform journal_synchro(o.id, jsonb_build_object('exercice_id', o.exercice_id),
      jsonb_build_object('exercice_id', new.exercice_id), 'Exercice synchronisé depuis l''onglet Dons');
  end if;
  return null;
end $$;

/** Contrôle côté comptabilité : un don au reçu établi fige montant et date. */
create or replace function public.operations_avant_maj()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  r text;
begin
  if new.montant <> old.montant or new.date_operation <> old.date_operation then
    select recu_numero into r from dons
     where operation_id = new.id and supprime_le is null and recu_numero ~ '^RE_' limit 1;
    if r is not null then
      raise exception 'Le don relié figure sur le reçu % : montant et date figés (annulez le reçu d''abord).', r;
    end if;
  end if;
  return new;
end $$;

/** Répercussions d'une opération vers son don : montant, date, mode, exercice ; lien rompu si ce n'est plus un don. */
create or replace function public.operations_apres_maj()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  cat_don uuid;
  m text;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if not exists (select 1 from dons where operation_id = new.id and supprime_le is null) then return null; end if;

  select id into cat_don from categories where nom = 'Don' limit 1;
  if old.categorie_id = cat_don and new.categorie_id is distinct from cat_don then
    update dons set operation_id = null where operation_id = new.id;
    return null;
  end if;

  m := mode_don_depuis_compta(new.mode_paiement);
  update dons d set
    montant = case when new.montant <> old.montant then new.montant else d.montant end,
    date_don = case
      when new.date_operation = old.date_operation then d.date_don
      when d.mode_paiement in ('Chèque', 'Espèces') and d.date_don <= new.date_operation then d.date_don
      else new.date_operation end,
    mode_paiement = case
      when new.mode_paiement is distinct from old.mode_paiement and m is not null then m
      else d.mode_paiement end,
    exercice_id = case
      when new.exercice_id is distinct from old.exercice_id and new.exercice_id is not null then new.exercice_id
      else d.exercice_id end
  where d.operation_id = new.id and d.supprime_le is null;
  return null;
end $$;

drop trigger if exists dons_avant_maj on public.dons;
create trigger dons_avant_maj before update on public.dons
  for each row execute function public.dons_avant_maj();
drop trigger if exists dons_apres_maj on public.dons;
create trigger dons_apres_maj after update on public.dons
  for each row execute function public.dons_apres_maj();
drop trigger if exists operations_avant_maj on public.operations;
create trigger operations_avant_maj before update on public.operations
  for each row execute function public.operations_avant_maj();
drop trigger if exists operations_apres_maj on public.operations;
create trigger operations_apres_maj after update on public.operations
  for each row execute function public.operations_apres_maj();
