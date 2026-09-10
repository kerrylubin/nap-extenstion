-- Run this in the Supabase SQL Editor
-- Dashboard → SQL Editor → New query → paste → Run

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS personal_notes text,
ADD COLUMN IF NOT EXISTS reference_name text,
ADD COLUMN IF NOT EXISTS reference_phone text,
ADD COLUMN IF NOT EXISTS reference_linkedin text;
