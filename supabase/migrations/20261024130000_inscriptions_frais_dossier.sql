-- 15/10/2026 — Suivi du paiement des frais de dossier (nouvel élève : préinscription).
-- États : à demander, demandé (en attente du paiement), réglé, exonéré, remboursé.

alter table public.inscriptions_dossiers
  add column if not exists frais_statut text check (frais_statut in ('a_demander', 'demande', 'regle', 'exonere', 'rembourse')),
  add column if not exists frais_montant numeric(10, 2),
  add column if not exists frais_mode text check (frais_mode in ('cheque', 'virement', 'especes', 'carte', 'autre')),
  add column if not exists frais_le date,
  add column if not exists frais_note text;

-- Préinscriptions existantes et futures : frais « à demander » par défaut.
update public.inscriptions_dossiers set frais_statut = 'a_demander' where type = 'preinscription' and frais_statut is null;

create or replace function public.inscription_frais_defaut() returns trigger
language plpgsql as $$
begin
  if new.type = 'preinscription' and new.frais_statut is null then new.frais_statut := 'a_demander'; end if;
  return new;
end;
$$;
drop trigger if exists inscription_frais_defaut on public.inscriptions_dossiers;
create trigger inscription_frais_defaut before insert on public.inscriptions_dossiers for each row execute function public.inscription_frais_defaut();

create or replace function public.inscription_frais(p_id uuid, p_statut text, p_montant numeric default null, p_mode text default null, p_le date default null, p_note text default null)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.est_directrice() then raise exception 'Accès refusé'; end if;
  if p_statut is not null and p_statut not in ('a_demander', 'demande', 'regle', 'exonere', 'rembourse') then raise exception 'État inconnu : %', p_statut; end if;
  if p_mode is not null and p_mode not in ('cheque', 'virement', 'especes', 'carte', 'autre') then raise exception 'Mode inconnu : %', p_mode; end if;
  update inscriptions_dossiers
     set frais_statut = p_statut, frais_montant = p_montant, frais_mode = p_mode, frais_le = p_le, frais_note = nullif(btrim(coalesce(p_note, '')), ''), updated_at = now()
   where id = p_id;
  if not found then raise exception 'Dossier introuvable'; end if;
end;
$$;
revoke all on function public.inscription_frais(uuid, text, numeric, text, date, text) from public, anon;
grant execute on function public.inscription_frais(uuid, text, numeric, text, date, text) to authenticated;
