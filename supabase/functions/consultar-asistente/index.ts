import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Configuración de cabeceras CORS para permitir peticiones desde la App Móvil
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apiKey, content-type',
}

serve(async (req) => {
  // Manejar la petición preflight de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Obtener las variables de entorno del servidor de Supabase
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!geminiKey || !supabaseUrl || !supabaseAnonKey) {
      throw new Error("Faltan variables de entorno esenciales en el servidor.")
    }

    // 2. Extraer los parámetros que envía la app móvil
    const { pregunta, cultivoActual } = await req.json()
    if (!pregunta) {
      return new Response(JSON.stringify({ error: "La pregunta es requerida." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // 3. Inicializar el cliente interno de Supabase con los privilegios de la función
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey)

    // 4. PASO RAG A: Obtener el Vector Matemático desde la API de Gemini (Embedding)
    const embeddingUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiKey}`
    const embeddingRes = await fetch(embeddingUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "models/gemini-embedding-001",
        content: { parts: [{ text: pregunta }] }
      })
    })
    
    const embeddingData = await embeddingRes.json()
    if (!embeddingData.embedding?.values) {
      throw new Error("No se pudo generar el embedding con Gemini.")
    }
    const vector = embeddingData.embedding.values.slice(0, 768)

    // 5. PASO RAG B: Buscar conocimiento guardado en la base de datos usando RPC
    const { data: documentos, error: rpcError } = await supabaseClient.rpc('buscar_conocimiento_agricola', {
      query_embedding: vector,
      match_threshold: 0.35,
      match_count: 3
    })

    if (rpcError) throw rpcError

    const contextoExtraido = documentos && documentos.length > 0 
      ? documentos.map((doc: any) => doc.texto_busqueda).join(" ") 
      : "Sin datos específicos de este tema en la base de datos."

    // 6. PASO RAG C: Enviar contexto + pregunta a Gemini 1.5 Flash para la respuesta final
    const chatUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`
    
    const promptSistema = `
      Eres el Asesor Agrícola Experto de Roslinapp. Estás orientando a un productor rural sobre el cultivo de ${cultivoActual || 'diversos cultivos'}.
      Tienes conocimiento integral sobre clima, nutrición, economía, plagas y buenas prácticas.
      
      Usa ÚNICAMENTE la siguiente información oficial extraída de la base de datos para responder:
      "${contextoExtraido}"
      
      Reglas de oro:
      1. Responde de forma directa, respetuosa ("Patrón" o "Productor") y en lenguaje de campo claro.
      2. No uses más de 50 palabras para no cansar al escuchar.
      3. Si te preguntan de precios, dales los datos económicos con claridad.
      4. Si la respuesta a lo que te preguntan no está en la información oficial provista arriba, di exactamente: "Ese dato no lo tengo a la mano, patrón. Le sugiero consultar con su técnico de confianza."
      
      Pregunta del productor: "${pregunta}"
    `

    const chatRes = await fetch(chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptSistema }] }]
      })
    })
    
    const chatData = await chatRes.json()
    const respuestaFinal = chatData.candidates[0].content.parts[0].text

    // 7. Retornar el resultado limpio a la aplicación móvil
    return new Response(JSON.stringify({ respuesta: respuestaFinal }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})