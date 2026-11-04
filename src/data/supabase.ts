import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL = import.meta.env.VITE_SUPABASE_URL as string
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string
const TOKEN_KEY = 'popis:token'

let client: SupabaseClient | null = null

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

/** Stores the app session token; the client is rebuilt so requests carry it. */
export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // private mode etc. — session just won't survive a reload
  }
  client = null
}

/** Supabase client that sends the session token checked by row-level security. */
export function sb(): SupabaseClient {
  if (!client) {
    const token = getToken()
    client = createClient(URL, KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: token ? { 'x-session-token': token } : {} },
    })
  }
  return client
}

/** Unwraps a Supabase response, throwing on error. */
export async function run<T>(req: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await req
  if (error) throw new Error(error.message)
  return data as T
}
