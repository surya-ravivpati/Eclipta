ALTER TABLE public.user_profiles REPLICA IDENTITY FULL;
ALTER TABLE public.user_ecliptars REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_ecliptars;