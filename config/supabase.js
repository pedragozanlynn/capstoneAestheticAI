import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://cdevizjuihwjbuiylhsi.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkZXZpemp1aWh3amJ1aXlsaHNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4OTg3MjgsImV4cCI6MjA3OTQ3NDcyOH0.GP-vIgCtnQ_leIiwIT_asuqpxrwlkH_cBCfx2x7OSvE";

  export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  
