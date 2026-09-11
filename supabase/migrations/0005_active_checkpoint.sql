-- Which checkpoint the event is currently running.
--
-- One switch in Settings rather than a picker on every surface: the dashboard counts
-- against it, the scanner opens on it, and a bulk check-in defaults to it. Before it was
-- this, each screen guessed — usually "the first one dated today" — and the three guesses
-- could disagree with each other and with the door the crew were actually working.
--
-- `on delete set null` because deleting a checkpoint must not take the event with it; the
-- code falls back to the first checkpoint dated today, as it did before this column.
alter table events
  add column active_checkpoint_id uuid references checkpoints (id) on delete set null;
