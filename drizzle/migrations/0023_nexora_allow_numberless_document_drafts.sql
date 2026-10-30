-- Draft documents do not receive a sequential number until the authorized issue workflow.
alter table public.commercial_documents alter column number drop not null;
