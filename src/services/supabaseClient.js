import 'react-native-url-polyfill/auto' // Importante para que no falle en Android
import { createClient } from '@supabase/supabase-js'

// ⚠️ REEMPLAZA ESTO CON TUS CREDENCIALES REALES
const supabaseUrl = 'https://nnvbgnshoogwljnedlch.supabase.co'
const supabaseKey = 'sb_publishable_gaGNm29ufoJUWAy_vgMIVA_T8dJZ2D6' 

export const supabase = createClient(supabaseUrl, supabaseKey)