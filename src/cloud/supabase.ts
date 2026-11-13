// Verbindung zu Supabase (Konto + Cloud-Speicher).
// Ohne VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY läuft die App wie bisher nur lokal.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          // Angemeldet bleiben – auch nach Neustart des PCs / iPhones
          persistSession: true,
          autoRefreshToken: true,
          storageKey: 'ansitzplaner-auth',
        },
      })
    : null

export const cloudEnabled = supabase !== null

/** Name des privaten Foto-Speichers in Supabase */
export const PHOTO_BUCKET = 'photos'
