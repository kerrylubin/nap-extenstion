-- Run this in the Supabase SQL Editor
-- Dashboard → SQL Editor → New query → paste → Run

ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS recruiter_phone text;
