import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://wcolbngreneyjrhoeolu.supabase.co";
const supabaseAnonKey = "sb_publishable_IHyIpIkM1nHf-zg4Zr3Mfw_9S4C1Dg_";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);