import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://otcegorzfuyumnflanas.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_2cN6h2kEXJxzhYpN-wmRfA_q5Dzm6Lr";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);