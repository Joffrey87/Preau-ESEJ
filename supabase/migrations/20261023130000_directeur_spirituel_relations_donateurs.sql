-- 23/10/2026 — Le Directeur spirituel modifie l'onglet Relations donateurs comme le Trésorier : tableaux donateurs et
-- prospects, fiches, Suivi, état, Relation, Responsable, Réservé à, commentaire, modifications en ligne.
-- Ses changements de Relation alertent le Trésorier (comme pour tout profil autre que le Trésorier).
-- Additif : on ajoute 'directeur-spirituel' aux contrôles de profil existants, sans rien retirer.

create or replace function public.peut_suivre_donateurs() returns boolean
language sql stable security definer set search_path = public as $$
  select public.mon_role() in ('recherche-fonds', 'tresorier', 'administrateur', 'directeur-spirituel');
$$;

-- Fonctions à liste de profils : même définition, 'directeur-spirituel' ajouté à la liste.
do $$
declare
  f text;
  d text;
begin
  foreach f in array array[
    'public.definir_contact_reserve(uuid[], text)',
    'public.definir_ne_pas_solliciter(uuid[], boolean)',
    'public.definir_famille(uuid[], text)',
    'public.definir_boursier(uuid[], boolean, boolean)',
    'public.dons_modifier_relation(uuid[], text, text)',
    'public.dons_modifier_contact_donateur(uuid[], text, text, text, text, jsonb, text)'
  ] loop
    d := pg_get_functiondef(f::regprocedure);
    if d !~ 'directeur-spirituel' then
      d := regexp_replace(d, '(not in \()(''recherche-fonds'',)', '\1''directeur-spirituel'', \2');
      execute d;
    end if;
  end loop;
end;
$$;

-- Prospects : écriture.
drop policy if exists prospects_ecriture on public.prospects;
create policy prospects_ecriture on public.prospects for all
  using (public.est_tresorier() or public.mon_role() in ('recherche-fonds', 'directeur-spirituel'))
  with check (public.est_tresorier() or public.mon_role() in ('recherche-fonds', 'directeur-spirituel'));

drop policy if exists prospects_ecritures_ecriture on public.prospects_ecritures;
create policy prospects_ecritures_ecriture on public.prospects_ecritures for all
  using (public.mon_role() in ('president', 'tresorier', 'administrateur', 'directeur-spirituel'))
  with check (public.mon_role() in ('president', 'tresorier', 'administrateur', 'directeur-spirituel'));
drop policy if exists prospects_ecritures_lecture on public.prospects_ecritures;
create policy prospects_ecritures_lecture on public.prospects_ecritures for select
  using (public.mon_role() in ('president', 'tresorier', 'administrateur', 'directeur-spirituel'));
