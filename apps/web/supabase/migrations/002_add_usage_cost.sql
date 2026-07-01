-- Run this in the Supabase SQL Editor
-- Dashboard → SQL Editor → New query → paste → Run

ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS tokens_used integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS cost_usd numeric(10, 6) DEFAULT 0.000000;
