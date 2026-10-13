-- 15/10/2026 — DÉPÔT DE CHÈQUES : motif « Inconnu » et case « Doute ».
-- Un chèque au motif inconnu ou marqué « Doute » n'est jamais relié automatiquement :
-- seul un lien confirmé à la main (« manuel ») est accepté.

alter table public.cheques_remis drop constraint if exists cheques_remis_motif_check;
alter table public.cheques_remis add constraint cheques_remis_motif_check
  check (motif in ('don', 'frais_scolarite', 'frais_dossier', 'fourniture', 'activite', 'evenement', 'autre', 'inconnu'));

alter table public.cheques_remis add column if not exists doute boolean not null default false;
comment on column public.cheques_remis.doute is 'true = doute sur le chèque : jamais de lien automatique';

alter table public.cheques_remis drop constraint if exists cheques_remis_pas_auto_si_doute;
alter table public.cheques_remis add constraint cheques_remis_pas_auto_si_doute
  check (lien is distinct from 'auto' or (not doute and motif <> 'inconnu'));

-- Photo de la remise : prête à devenir une « pièce comptable » rattachée à l'opération bancaire
-- (remises_cheques.operation_id). Le lien vers le Drive viendra plus tard.
alter table public.remises_cheques
  add column if not exists photo_type text,
  add column if not exists photo_octets integer;
comment on column public.remises_cheques.photo_path is 'Chemin dans le bucket cheques : <remise_id>/remise.<ext> — future pièce comptable de l''opération';
