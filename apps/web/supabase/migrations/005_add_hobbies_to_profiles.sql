-- Run this in the Supabase SQL Editor
-- Dashboard → SQL Editor → New query → paste → Run

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS hobbies text;
