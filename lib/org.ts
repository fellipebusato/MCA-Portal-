// lib/org.ts
// Organization helpers — multi-tenant foundation
// Currently single-tenant (FB Client Portal) but architected for future brokers

import { supabase } from "@/lib/supabase";

export async function getOrgId(): Promise<string | null> {
  const { data } = await supabase
    .from("organizations")
    .select("id")
    .limit(1)
    .single();
  return data?.id || null;
}