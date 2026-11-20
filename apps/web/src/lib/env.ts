const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
if (!url || !key) throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (see apps/web/.env.example)");

export const env = {
  supabaseUrl: url,
  supabaseKey: key,
  /** Base for the REST API. Dev: the Vite proxy to the local API. Prod: the deployed Edge Function. */
  apiBase:
    (import.meta.env.VITE_API_BASE as string | undefined) ||
    (import.meta.env.DEV ? "/functions/v1" : `${url}/functions/v1`),
  otpLength: Number(import.meta.env.VITE_OTP_LENGTH ?? 6),
};
