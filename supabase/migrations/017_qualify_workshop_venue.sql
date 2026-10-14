alter table public.event_settings
  alter column venue set default 'Institute of Information Technology (IIT), University of Dhaka';

update public.event_settings
set venue = venue || ', University of Dhaka'
where venue ~* '(\mIIT\M|Institute of Information Technology)'
  and venue !~* 'University of Dhaka';
