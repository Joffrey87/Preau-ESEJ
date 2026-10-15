-- 15/10/2026 — Le profil « Événement » s'appelle « Événementiel » (libellés seulement : le rôle technique « evenement »,
-- les adresses …@evenement.esej et les pages /evenement ne changent pas). Les trois fonctions du Webmestre qui
-- affichaient l'ancien libellé sont réécrites à l'identique, libellé mis à jour.
do $$
declare f text; d text;
begin
  foreach f in array array['public.acces_rechercher', 'public.acces_personne_reelle', 'public.acces_compte_evenement'] loop
    for d in select pg_get_functiondef(p.oid) from pg_proc p where p.oid::regproc::text = f or p.proname = split_part(f, '.', 2) and p.pronamespace = 'public'::regnamespace loop
      d := replace(d, '''Événement ('' ||', '''Événementiel ('' ||');
      d := replace(d, '''Membre Événement''', '''Membre Événementiel''');
      d := replace(replace(d, 'compte Événement.', 'compte Événementiel.'), 'compte Événement ', 'compte Événementiel ');
      execute d;
    end loop;
  end loop;
end $$;
