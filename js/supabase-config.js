/**
 * supabase-config.js
 * Configuration et initialisation du client Supabase.
 * Partagé entre inscription.html et planning-admin.html.
 *
 * Dépendances :
 *   - @supabase/supabase-js v2 (chargé via CDN avant ce fichier)
 *
 * Expose en global :
 *   - db           : client Supabase (lecture/écriture via RLS anon)
 *   - SUPABASE_URL : URL du projet Supabase
 *   - SUPABASE_ANON: clé publique anon (sans droits admin)
 */

const SUPABASE_URL  = 'https://uhwldzyevhrmektqzfic.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVod2xkenlldmhybWVrdHF6ZmljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMDU3MjQsImV4cCI6MjA5NjU4MTcyNH0.oEfbsLgp32CSfcyOnPXLxDFz5Ff7bGjq2k6PmciGBrw'

// Évite le conflit avec la variable globale `supabase` exposée par la librairie CDN
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON)
