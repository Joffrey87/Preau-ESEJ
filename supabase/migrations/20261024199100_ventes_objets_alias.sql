-- 19/10/2026 — Mots-clés (alias) d'un objet de Ventes diverses, reconnus dans le libellé d'une recette à l'import
-- (après le nom complet). « Photos de classe » : « photo ».
alter table public.ventes_sous_categories add column if not exists alias text[] not null default '{}';
update public.ventes_sous_categories set alias = array['photo']
 where nom = 'Photos de classe' and not ('photo' = any(alias));
