-- The contract half of 0040 (D203). The Info page's content lives in info_tabs; nothing reads
-- this column since the code that shipped with it. Applied only after that code was live.
alter table events drop column if exists info_page_html;
