-- 0129: WhatsApp each person their event link as soon as they register (D838). Off by default:
-- an organiser turns it on per event, in Settings → Registration.
alter table events add column whatsapp_on_register boolean not null default false;
