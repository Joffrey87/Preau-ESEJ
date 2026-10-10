-- 06/10/2026 — Reçus fiscaux, envois postaux : statuts À établir → À passer → Vérifier envoi postal → Envoyé,
-- réversibles. Chaque changement de `dons.recu_etat` est consigné (ancienne et nouvelle valeur) : on peut ainsi
-- revenir en arrière en connaissance de cause. Les états libres hérités des donateurs « courrier postal » sont
-- ramenés à l'un des statuts du parcours (leur ancien texte reste dans l'historique).

create table if not exists public.dons_etat_historique (
  id uuid primary key default gen_random_uuid(),
  don_id uuid not null references public.dons(id) on delete cascade,
  recu_numero text,
  ancien text,
  nouveau text,
  change_le timestamptz not null default now(),
  par text
);
create index if not exists dons_etat_historique_don_idx on public.dons_etat_historique (don_id, change_le desc);
create index if not exists dons_etat_historique_recu_idx on public.dons_etat_historique (recu_numero);
alter table public.dons_etat_historique enable row level security;
drop policy if exists dons_etat_historique_lecture on public.dons_etat_historique;
create policy dons_etat_historique_lecture on public.dons_etat_historique for select to authenticated using (public.est_bureau());

create or replace function public.consigner_etat_don() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.recu_etat is distinct from old.recu_etat then
    insert into public.dons_etat_historique (don_id, recu_numero, ancien, nouveau, par)
    values (new.id, new.recu_numero, old.recu_etat, new.recu_etat, coalesce(auth.jwt() ->> 'email', current_user));
  end if;
  return new;
end;
$$;
drop trigger if exists consigner_etat_don on public.dons;
create trigger consigner_etat_don after update of recu_etat on public.dons
  for each row execute function public.consigner_etat_don();

-- Donateurs « courrier postal » : tout reçu numéroté doit porter un état du parcours.
--   - texte libre signalant un contrôle en cours (« À VÉRIFIER », « … par Cécile - à valider ») → Vérifier envoi postal
--   - autres textes libres (contact manquant…) et absence d'état → À passer (état vide)
-- Les états « Envoyé le … » ne bougent pas.
update public.dons
   set recu_etat = 'Passé au secrétaire'
 where supprime_le is null and envoi_prefere = 'courrier' and recu_numero is not null
   and recu_etat is not null and recu_etat !~* '^envoy' and recu_etat <> 'Passé au secrétaire'
   and (recu_etat ~* 'v[ée]rifier' or recu_etat ~* 'valider');

update public.dons
   set recu_etat = null
 where supprime_le is null and envoi_prefere = 'courrier' and recu_numero is not null
   and recu_etat is not null and recu_etat !~* '^envoy' and recu_etat <> 'Passé au secrétaire';
