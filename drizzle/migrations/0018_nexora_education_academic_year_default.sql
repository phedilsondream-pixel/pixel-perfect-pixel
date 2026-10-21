alter table public.education_students
  alter column academic_year set default (
    extract(year from current_date)::integer::text || '/' ||
    (extract(year from current_date)::integer + 1)::text
  );
