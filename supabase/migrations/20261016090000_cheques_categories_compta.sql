-- 16/10/2026 — DÉPÔT DE CHÈQUES : la catégorie d'un chèque EST une catégorie de recette de la
-- Comptabilité (table categories, type « recette »). Plus de liste à part.
-- Le « motif » devient un comportement interne, déduit de la catégorie, qui pilote le rapprochement
-- et le suivi : don, frais_scolarite (Mensualités), frais_dossier, mois_avance, fourniture
-- (Rentes vie de l'école), activite (Rentes périscolaire), autre ; « inconnu » = pas de catégorie.

alter table public.cheques_remis
  add column if not exists categorie_id uuid references public.categories(id) on delete set null;
comment on column public.cheques_remis.categorie_id is 'Catégorie de recette de la Comptabilité ; null = Inconnu';

alter table public.cheques_remis drop constraint if exists cheques_remis_pas_auto_si_doute;
alter table public.cheques_remis drop constraint if exists cheques_remis_motif_check;
alter table public.cheques_remis add constraint cheques_remis_motif_check
  check (motif in ('don', 'frais_scolarite', 'frais_dossier', 'mois_avance', 'fourniture', 'activite', 'evenement', 'autre', 'inconnu'));

create or replace function public.cheque_motif_categorie(p_categorie uuid)
returns text language sql stable set search_path to 'public' as $$
  select case
    when p_categorie is null then 'inconnu'
    when c.nom in ('Don', 'Don d''Association') then 'don'
    when c.nom = 'Frais de scolarité : Mensualités' then 'frais_scolarite'
    when c.nom = 'Frais de scolarité : Dossier' then 'frais_dossier'
    when c.nom = 'Frais de scolarité : Mois d''avance' then 'mois_avance'
    when c.nom ilike 'Rentes vie de l''école%' then 'fourniture'
    when c.nom = 'Rentes périscolaire' then 'activite'
    else 'autre' end
  from (select 1) x left join categories c on c.id = p_categorie;
$$;

-- Reprise des chèques existants : ancienne liste → catégorie de recette équivalente.
update public.cheques_remis ch set categorie_id = (
  select id from public.categories c where c.type = 'recette' and c.nom = case ch.motif
    when 'don' then 'Don'
    when 'frais_scolarite' then 'Frais de scolarité : Mensualités'
    when 'frais_dossier' then 'Frais de scolarité : Dossier'
    when 'fourniture' then 'Rentes vie de l''école (passif en achat fournitures)'
    when 'activite' then 'Rentes périscolaire'
    when 'evenement' then 'Ventes diverses au profit de l''école'
    when 'autre' then 'Ventes diverses' end limit 1)
where ch.categorie_id is null and ch.motif <> 'inconnu';

-- Le motif suit toujours la catégorie (déclencheur nommé pour passer AVANT cheques_remis_suivi).
create or replace function public.cheques_remis_categorie()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.motif := public.cheque_motif_categorie(new.categorie_id);
  return new;
end $$;
drop trigger if exists cheques_remis_a_categorie on public.cheques_remis;
create trigger cheques_remis_a_categorie
  before insert or update of categorie_id, motif on public.cheques_remis
  for each row execute function public.cheques_remis_categorie();

alter table public.cheques_remis disable trigger cheques_remis_suivi;
update public.cheques_remis set motif = public.cheque_motif_categorie(categorie_id);
alter table public.cheques_remis enable trigger cheques_remis_suivi;

alter table public.cheques_remis add constraint cheques_remis_pas_auto_si_doute
  check (lien is distinct from 'auto' or (not doute and motif <> 'inconnu'));

-- Suivi : le mois d'avance pose une affectation de nature « mois_avance ».
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

  if new.motif in ('frais_scolarite', 'frais_dossier', 'mois_avance') and new.inscription_id is not null then
    v_nature := case new.motif when 'frais_dossier' then 'frais_dossier' when 'mois_avance' then 'mois_avance' else 'mensualite' end;
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
  before insert or update of motif, categorie_id, montant, emetteur, inscription_id, famille_id, activite_id, remise_id, lien
  or delete on public.cheques_remis
  for each row execute function public.cheques_remis_suivi();

notify pgrst, 'reload schema';
