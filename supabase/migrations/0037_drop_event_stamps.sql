-- The contract half of 0036 (D189). The passport's target and reward message live on the
-- passport activity now (D182); nothing reads these since the code that shipped with 0036.
-- Applied only after that code was live, so production never read a column that had gone.
alter table events drop column if exists stamps_required;
alter table events drop column if exists stamps_message;
