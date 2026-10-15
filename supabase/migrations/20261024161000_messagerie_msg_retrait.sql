-- 15/10/2026 — Abandon de l'ancienne messagerie (branche feat/messagerie, tables msg_*, jamais fusionnée ni utilisée :
-- aucune conversation) au profit de la messagerie « Communication » (com_*). Le correctif webmestre_compte_evenement_fix
-- appliqué avec elle est conservé (il ne concerne pas la messagerie).

drop policy if exists "messagerie depot" on storage.objects;
drop policy if exists "messagerie lecture" on storage.objects;

do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname = 'public' and p.proname like 'msg\_%'
  loop
    execute format('drop function if exists %s cascade', f);
  end loop;
end $$;

drop table if exists public.msg_signaux, public.msg_moderation, public.msg_blocages_perso, public.msg_blocages,
  public.msg_messages, public.msg_membres, public.msg_conversations cascade;

-- Page du catalogue Webmestre : /messagerie devient /communication (les droits par profil suivent la clé).
update public.acces_pages set cle = '/communication', libelle = 'Messagerie', section = 'Communication' where cle = '/messagerie';
update public.acces_profils set niveau = case when profil in ('directrice', 'tresorier', 'secretaire', 'administrateur', 'evenement')
  then 'modification' else 'masque' end where page = '/communication';
