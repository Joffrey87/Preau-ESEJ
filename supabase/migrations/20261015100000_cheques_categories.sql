-- 15/10/2026 — DÉPÔT DE CHÈQUES : catégories des chèques des familles et mise à jour du suivi.
-- Un chèque de famille n'est pas toujours de la scolarité : il peut payer des fournitures ou une activité.
--   • frais_scolarite / frais_dossier → inscription de la famille ; une affectation de scolarité
--     (nature « mensualite » ou « frais_dossier ») est posée sur l'opération bancaire de la remise.
--   • activite → activité + famille ; les participations NON payées des enfants de la famille à
--     cette activité sont marquées payées (date de remise, opération de la remise).
--   • fourniture → famille seulement : Préau n'a pas de suivi des fournitures achetées par les
--     familles ; le chèque reste la trace (catégorie + famille + opération de la remise).
-- Pas de double comptage : une affectation identique déjà saisie (même opération, inscription,
-- nature, montant) est reprise au lieu d'être recréée ; une participation déjà payée n'est pas
-- touchée ; tout ce que Préau a posé est retiré si le chèque est délié, modifié ou supprimé, ou si
-- la remise perd son opération bancaire. Tant que la remise n'est pas reliée à son crédit
-- bancaire, rien n'est posé (le suivi de scolarité compte des écritures bancaires).

alter table public.cheques_remis drop constraint if exists cheques_remis_motif_check;
alter table public.cheques_remis add constraint cheques_remis_motif_check
  check (motif in ('don', 'frais_scolarite', 'frais_dossier', 'fourniture', 'activite', 'evenement', 'autre'));

alter table public.cheques_remis
  add column if not exists famille_id uuid references public.familles(id) on delete set null,
  add column if not exists activite_id uuid references public.activites(id) on delete set null,
  add column if not exists affectation_id uuid, -- sans clé étrangère : le déclencheur gère la cohérence
  add column if not exists affectation_reprise boolean not null default false,
  add column if not exists participations_payees uuid[] not null default '{}';

comment on column public.cheques_remis.affectation_id is 'Affectation de scolarité correspondant au chèque (posée ou reprise par Préau)';
comment on column public.cheques_remis.affectation_reprise is 'true = l''affectation existait déjà (saisie à la main) : Préau ne la supprime pas en déliant';
comment on column public.cheques_remis.participations_payees is 'Participations à une activité marquées payées par ce chèque (remises à « non payé » en déliant)';

-- Défait ce qu'un chèque a posé dans le suivi.
create or replace function public.cheque_defaire_suivi(c public.cheques_remis)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if c.affectation_id is not null and not c.affectation_reprise then
    delete from affectations_scolarite where id = c.affectation_id;
  end if;
  if coalesce(array_length(c.participations_payees, 1), 0) > 0 then
    update activites_participations set paye_le = null, operation_id = null
     where id = any (c.participations_payees);
  end if;
end $$;
revoke all on function public.cheque_defaire_suivi(public.cheques_remis) from public, anon, authenticated;

create or replace function public.cheques_remis_suivi()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_op uuid;
  v_date date;
  v_nature text;
  v_aff uuid;
begin
  if tg_op = 'DELETE' then
    perform public.cheque_defaire_suivi(old);
    return old;
  end if;

  -- Rien à faire si ni le lien ni l'opération de la remise n'ont changé.
  select operation_id, date_remise into v_op, v_date from remises_cheques where id = new.remise_id;
  if tg_op = 'UPDATE' then
    perform public.cheque_defaire_suivi(old);
  end if;
  new.affectation_id := null;
  new.affectation_reprise := false;
  new.participations_payees := '{}';

  if v_op is null then
    return new;
  end if;

  if new.motif in ('frais_scolarite', 'frais_dossier') and new.inscription_id is not null then
    v_nature := case new.motif when 'frais_dossier' then 'frais_dossier' else 'mensualite' end;
    -- Affectation déjà saisie à la main, pas encore rattachée à un autre chèque ?
    select a.id into v_aff
      from affectations_scolarite a
     where a.operation_id = v_op and a.inscription_id = new.inscription_id
       and a.nature = v_nature and abs(a.montant - new.montant) < 0.005
       and not exists (select 1 from cheques_remis c where c.affectation_id = a.id and c.id <> new.id)
     limit 1;
    if v_aff is not null then
      new.affectation_id := v_aff;
      new.affectation_reprise := true;
    else
      insert into affectations_scolarite (operation_id, inscription_id, montant, nature, notes)
      values (v_op, new.inscription_id, new.montant, v_nature, 'Chèque déposé (Dépôt de chèques) : ' || new.emetteur)
      returning id into new.affectation_id;
    end if;
  elsif new.motif = 'activite' and new.activite_id is not null and new.famille_id is not null then
    with marquees as (
      update activites_participations p set paye_le = v_date, operation_id = v_op
        from eleves e
       where e.id = p.eleve_id and e.famille_id = new.famille_id
         and p.activite_id = new.activite_id and p.paye_le is null and p.operation_id is null
      returning p.id
    )
    select coalesce(array_agg(id), '{}') into new.participations_payees from marquees;
  end if;
  return new;
end $$;
revoke all on function public.cheques_remis_suivi() from public, anon, authenticated;

drop trigger if exists cheques_remis_suivi on public.cheques_remis;
create trigger cheques_remis_suivi
  before insert or update of motif, montant, emetteur, inscription_id, famille_id, activite_id, remise_id, lien
  or delete on public.cheques_remis
  for each row execute function public.cheques_remis_suivi();

-- La remise gagne ou perd son opération bancaire : on recalcule le suivi de ses chèques.
create or replace function public.remises_cheques_suivi()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.operation_id is distinct from old.operation_id or new.date_remise is distinct from old.date_remise then
    update cheques_remis set lien = lien where remise_id = new.id;
  end if;
  return new;
end $$;
revoke all on function public.remises_cheques_suivi() from public, anon, authenticated;

drop trigger if exists remises_cheques_suivi on public.remises_cheques;
create trigger remises_cheques_suivi
  after update on public.remises_cheques
  for each row execute function public.remises_cheques_suivi();

notify pgrst, 'reload schema';
