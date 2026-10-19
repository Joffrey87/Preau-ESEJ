-- 19/10/2026 — Relevés en attente : le Bot Préau dépose l'export Excel du Crédit Mutuel ; le Trésorier l'ouvre dans
-- Comptabilité › Import (même écran de vérification) puis le valide ou l'annule. Le fichier d'origine est conservé.
-- Accès : aucune lecture directe ; fonctions réservées au Trésorier (le Webmestre est le compte du Trésorier).

create table if not exists public.releves_attente (
  id uuid primary key default gen_random_uuid(),
  nom_fichier text not null,
  contenu bytea not null,
  taille integer not null,
  sha256 text not null,
  date_debut date,
  date_fin date,
  depose_le timestamptz not null default now(),
  depose_par text not null default 'Bot Préau',
  statut text not null default 'en_attente' check (statut in ('en_attente', 'valide', 'annule', 'remplace')),
  import_id uuid references public.imports_releve(id) on delete set null,
  traite_le timestamptz
);
alter table public.releves_attente enable row level security;
revoke all on public.releves_attente from anon, authenticated;
create unique index if not exists releves_attente_un_seul on public.releves_attente ((true)) where statut = 'en_attente';

create or replace function public.peut_releves_attente() returns boolean
language sql stable security definer set search_path = public as $$
  select public.mon_role_reel() = 'tresorier' or public.est_webmestre();
$$;
revoke all on function public.peut_releves_attente() from public, anon;
grant execute on function public.peut_releves_attente() to authenticated;

/** Dépôt (service / connecteur uniquement) : le relevé en attente précédent est marqué « remplacé ». */
create or replace function public.releve_attente_deposer(p_nom text, p_contenu bytea, p_debut date, p_fin date, p_par text default 'Bot Préau')
returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v uuid;
begin
  update releves_attente set statut = 'remplace', traite_le = now() where statut = 'en_attente';
  insert into releves_attente (nom_fichier, contenu, taille, sha256, date_debut, date_fin, depose_par)
  values (p_nom, p_contenu, length(p_contenu), encode(digest(p_contenu, 'sha256'), 'hex'), p_debut, p_fin, coalesce(p_par, 'Bot Préau'))
  returning id into v;
  return v;
end;
$$;
revoke all on function public.releve_attente_deposer(text, bytea, date, date, text) from public, anon, authenticated;

/** Relevé en attente (fichier en base64), pour le Trésorier. */
create or replace function public.releve_attente_lire()
returns table (id uuid, nom_fichier text, contenu_base64 text, date_debut date, date_fin date, depose_le timestamptz, depose_par text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.peut_releves_attente() then return; end if;
  return query select r.id, r.nom_fichier, encode(r.contenu, 'base64'), r.date_debut, r.date_fin, r.depose_le, r.depose_par
    from releves_attente r where r.statut = 'en_attente' order by r.depose_le desc limit 1;
end;
$$;
revoke all on function public.releve_attente_lire() from public, anon;
grant execute on function public.releve_attente_lire() to authenticated;

/** Le Trésorier valide (avec l'import créé) ou annule le relevé en attente. */
create or replace function public.releve_attente_traiter(p_id uuid, p_statut text, p_import uuid default null) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.peut_releves_attente() then raise exception 'Réservé au Trésorier'; end if;
  if p_statut not in ('valide', 'annule') then raise exception 'Statut inconnu'; end if;
  update releves_attente set statut = p_statut, import_id = case when p_statut = 'valide' then p_import end, traite_le = now()
   where id = p_id and statut = 'en_attente';
end;
$$;
revoke all on function public.releve_attente_traiter(uuid, text, uuid) from public, anon;
grant execute on function public.releve_attente_traiter(uuid, text, uuid) to authenticated;
