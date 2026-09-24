-- The agenda banner (D160's masthead above the portal agenda) is retired: image rows placed in
-- the day (D196) do the same job where the organiser wants it. Nothing reads this column since
-- the code that removed the banner. Applied only after that code was live, so production never
-- read a column that had gone. Every event's value was null when this was written.
alter table events drop column if exists agenda_banner_url;
