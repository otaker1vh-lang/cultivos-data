#!/usr/bin/env python3
"""
Generador Automático de Información Detallada de Cultivos
Usa Claude API (Anthropic) para expandir cultivos.json

INSTALACIÓN:
pip install anthropic requests

USO:
python generar_cultivos_completos.py

NOTA: Necesitas API key de Anthropic (gratuita hasta cierto límite)
Obtener en: https://console.anthropic.com/
"""

import json
import os
import time
from datetime import datetime
from pathlib import Path
import anthropic

class GeneradorCultivosIA:
    def __init__(self, api_key=None):
        """
        Inicializa el generador con API key de Anthropic
        
        API Key gratuita: https://console.anthropic.com/
        Límite gratuito: ~$5 créditos iniciales
        """
        self.api_key = api_key or os.environ.get('ANTHROPIC_API_KEY')
        if not self.api_key:
            raise ValueError(
                "❌ Necesitas una API key de Anthropic\n"
                "   1. Obtén una en: https://console.anthropic.com/\n"
                "   2. Configura: export ANTHROPIC_API_KEY='tu-key'\n"
                "   3. O pásala al constructor: GeneradorCultivosIA(api_key='tu-key')"
            )
        
        self.client = anthropic.Anthropic(api_key=self.api_key)
        self.cultivos_procesados = 0
        self.costo_estimado = 0
        
    def cargar_cultivos_base(self, archivo='cultivos.json'):
        """Carga tu archivo cultivos.json actual"""
        try:
            with open(archivo, 'r', encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            print(f"❌ No se encontró {archivo}")
            return None
    
    def generar_prompt_cultivo(self, nombre_cultivo, datos_base):
        """
        Genera el prompt para Claude basado en tus datos actuales
        """
        stats = datos_base.get('estadisticas', {})
        
        prompt = f"""Eres un experto en agronomía mexicana. Genera información DETALLADA y PRECISA para el cultivo de {nombre_cultivo} en México.

DATOS BASE DISPONIBLES:
- Rendimiento: {stats.get('rendimiento_promedio_t_por_ha', 'N/A')} t/ha
- Precio promedio: ${stats.get('precio_medio_mxn_ton', 'N/A')} MXN/ton
- Producción: {stats.get('produccion_miles_ton', 'N/A')} mil toneladas
- Estados principales: {', '.join(stats.get('principales_estados', []))}

GENERA UN JSON con la siguiente estructura EXACTA (NO agregues texto adicional, SOLO el JSON):

{{
  "economia_expandida": {{
    "precio_min_mxn_ton": [precio mínimo histórico],
    "precio_max_mxn_ton": [precio máximo histórico],
    "epoca_mejor_precio": "[meses con mejor precio]",
    "epoca_peor_precio": "[meses con peor precio]",
    "valor_produccion_millones_mxn": [valor total],
    "margen_utilidad_promedio_pct": [porcentaje]
  }},
  
  "costos_produccion_detallados": {{
    "establecimiento_primer_año": {{
      "preparacion_terreno": [monto MXN],
      "material_vegetal": [monto MXN],
      "infraestructura_riego": [monto MXN],
      "total": [suma total]
    }},
    "operacion_anual": {{
      "fertilizantes": [monto],
      "control_plagas": [monto],
      "riego_energia": [monto],
      "mano_obra": [monto],
      "cosecha": [monto],
      "total": [suma]
    }},
    "costo_por_kg_produccion": [costo unitario],
    "punto_equilibrio_ton_ha": [toneladas necesarias]
  }},
  
  "calendarios_regionales": [
    {{
      "region": "[Estado/región específica]",
      "altitud_msnm": "[rango altitud]",
      "siembra_inicio": "[mes]",
      "siembra_fin": "[mes]",
      "cosecha_inicio": "[mes]",
      "cosecha_fin": "[mes]",
      "rendimiento_esperado_t_ha": [rendimiento],
      "ventana_comercial": "[descripción mercado]"
    }}
  ],
  
  "plagas_detalladas": [
    {{
      "nombre": "[Nombre común]",
      "nombre_cientifico": "[Nombre científico]",
      "tipo": "Plaga/Enfermedad",
      "descripcion": "[Daño que causa]",
      "umbral_economico": "[Cuando controlar]",
      "control_quimico": [
        {{
          "ingrediente_activo": "[Nombre]",
          "nombre_comercial": "[Marca México]",
          "dosis": "[dosis/ha]",
          "costo_aplicacion_ha": [monto MXN]
        }}
      ],
      "control_biologico": "[Alternativas biológicas]",
      "epoca_mayor_incidencia": "[meses]"
    }}
  ],
  
  "programa_fertilizacion": [
    {{
      "etapa": "[Etapa fenológica]",
      "formula": "[NPK + micro]",
      "dosis_kg_ha": [cantidad],
      "metodo_aplicacion": "[Método]",
      "costo_ha": [monto MXN]
    }}
  ],
  
  "sistemas_riego": [
    {{
      "sistema": "[Goteo/Aspersión/etc]",
      "eficiencia_pct": [porcentaje],
      "costo_instalacion_ha": [monto MXN],
      "costo_operacion_anual": [monto MXN],
      "lamina_anual_mm": [lámina agua],
      "recomendacion": "[Cuándo usar]"
    }}
  ],
  
  "mercado_comercializacion": {{
    "canales_venta": [
      {{
        "canal": "[Central Abasto/Supermercado/etc]",
        "participacion_pct": [porcentaje],
        "precio_promedio_kg": [precio],
        "condiciones_pago": "[días/contado]"
      }}
    ],
    "temporadas_precio": [
      {{
        "meses": "[rango meses]",
        "oferta": "Alta/Media/Baja",
        "precio_mxn_kg": [precio]
      }}
    ],
    "destinos_principales": [
      {{"ciudad": "[Ciudad]", "porcentaje": [%]}}
    ]
  }},
  
  "postcosecha": {{
    "punto_cosecha": "[Indicadores]",
    "vida_util_dias": [días],
    "temperatura_almacen": "[rango °C]",
    "humedad_relativa": "[rango %]",
    "perdidas_postcosecha_pct": [porcentaje],
    "empaque_recomendado": "[Tipo empaque]"
  }},
  
  "analisis_rentabilidad": {{
    "inversion_inicial_ha": [monto],
    "ingreso_anual_esperado_ha": [monto],
    "utilidad_neta_anual_ha": [monto],
    "roi_pct": [porcentaje],
    "años_recuperacion": [años],
    "riesgo": "Bajo/Medio/Alto"
  }},
  
  "alertas_riesgos": [
    {{
      "tipo": "Climático/Fitosanitario/Económico",
      "riesgo": "[Descripción]",
      "probabilidad": "Alta/Media/Baja",
      "impacto": "[Impacto económico]",
      "mitigacion": "[Cómo prevenir]"
    }}
  ],
  
  "recursos_asistencia": {{
    "instituciones": [
      {{
        "nombre": "[INIFAP/FIRA/etc]",
        "servicios": ["[servicio1]", "[servicio2]"],
        "contacto": "[teléfono/web]"
      }}
    ],
    "programas_apoyo_disponibles": ["[programa1]", "[programa2]"]
  }},
  
  "recomendaciones_clave": [
    "[Recomendación práctica 1]",
    "[Recomendación práctica 2]",
    "[Recomendación práctica 3]"
  ]
}}

IMPORTANTE:
- USA DATOS REALES de México (SIAP, INIFAP, FIRA)
- Precios y costos en PESOS MEXICANOS actuales (2024)
- Estados y regiones MEXICANAS
- Productos químicos REGISTRADOS en México
- Instituciones y programas MEXICANOS
- Responde SOLO con el JSON, sin texto adicional
"""
        return prompt
    
    def llamar_claude(self, prompt, max_reintentos=3):
        """
        Llama a la API de Claude para generar la información
        """
        for intento in range(max_reintentos):
            try:
                mensaje = self.client.messages.create(
                    model="claude-sonnet-4-20250514",  # Modelo más reciente
                    max_tokens=4000,
                    temperature=0.3,  # Baja para respuestas más consistentes
                    messages=[
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ]
                )
                
                # Extraer respuesta
                respuesta = mensaje.content[0].text
                
                # Calcular costo aproximado
                tokens_in = mensaje.usage.input_tokens
                tokens_out = mensaje.usage.output_tokens
                costo = (tokens_in * 0.003 + tokens_out * 0.015) / 1000  # Precios aproximados
                self.costo_estimado += costo
                
                return respuesta, costo
                
            except Exception as e:
                print(f"  ⚠️  Error en intento {intento + 1}: {e}")
                if intento < max_reintentos - 1:
                    time.sleep(2 ** intento)  # Backoff exponencial
                else:
                    return None, 0
        
        return None, 0
    
    def parsear_respuesta_json(self, respuesta_texto):
        """
        Extrae y parsea el JSON de la respuesta de Claude
        """
        try:
            # Buscar el JSON en la respuesta
            inicio = respuesta_texto.find('{')
            fin = respuesta_texto.rfind('}') + 1
            
            if inicio == -1 or fin == 0:
                return None
            
            json_str = respuesta_texto[inicio:fin]
            return json.loads(json_str)
            
        except json.JSONDecodeError as e:
            print(f"  ❌ Error parseando JSON: {e}")
            # Intentar limpiar y re-parsear
            try:
                # Remover posibles markdown
                json_str = json_str.replace('```json', '').replace('```', '')
                return json.loads(json_str)
            except:
                return None
    
    def expandir_cultivo(self, nombre, datos_base):
        """
        Expande la información de UN cultivo usando IA
        """
        print(f"\n{'='*60}")
        print(f"📦 Procesando: {nombre}")
        print(f"{'='*60}")
        
        # Generar prompt
        prompt = self.generar_prompt_cultivo(nombre, datos_base)
        
        # Llamar a Claude
        print("  🤖 Consultando Claude AI...")
        respuesta, costo = self.llamar_claude(prompt)
        
        if not respuesta:
            print(f"  ❌ No se pudo generar información para {nombre}")
            return datos_base
        
        print(f"  💰 Costo: ${costo:.4f} USD")
        
        # Parsear respuesta
        datos_expandidos = self.parsear_respuesta_json(respuesta)
        
        if not datos_expandidos:
            print(f"  ❌ Error parseando respuesta para {nombre}")
            return datos_base
        
        # Combinar con datos originales
        resultado = {
            **datos_base,
            **datos_expandidos,
            "meta_ia": {
                "generado_por": "Claude AI",
                "fecha": datetime.now().isoformat(),
                "version_modelo": "claude-sonnet-4",
                "costo_usd": round(costo, 4),
                "requiere_validacion": True
            }
        }
        
        print(f"  ✅ Información generada exitosamente")
        
        self.cultivos_procesados += 1
        return resultado
    
    def procesar_todos(self, archivo_entrada='cultivos.json', 
                       archivo_salida='cultivos_expandido_ia.json',
                       limite_cultivos=None):
        """
        Procesa todos los cultivos del archivo
        
        Args:
            limite_cultivos: Número máximo de cultivos a procesar (útil para pruebas)
        """
        print("🚀 GENERADOR AUTOMÁTICO DE CULTIVOS CON IA")
        print("="*60)
        print(f"📂 Archivo entrada: {archivo_entrada}")
        print(f"📝 Archivo salida: {archivo_salida}")
        print(f"🤖 Modelo: Claude Sonnet 4")
        print("="*60)
        
        # Cargar datos base
        datos_base = self.cargar_cultivos_base(archivo_entrada)
        if not datos_base:
            return False
        
        # Preparar resultado
        resultado = {
            "meta": {
                **datos_base.get('meta', {}),
                "version": "2.0-ia",
                "generado_con": "Claude AI (Anthropic)",
                "fecha_generacion": datetime.now().isoformat(),
                "nota": "Información generada automáticamente - requiere validación"
            },
            "categorias": datos_base.get('categorias', {}),
            "cultivos": {}
        }
        
        # Obtener lista de cultivos
        cultivos = list(datos_base.get('cultivos', {}).items())
        if limite_cultivos:
            cultivos = cultivos[:limite_cultivos]
            print(f"⚠️  MODO PRUEBA: Procesando solo {limite_cultivos} cultivos")
        
        total = len(cultivos)
        print(f"\n📊 Total cultivos a procesar: {total}\n")
        
        # Procesar cada cultivo
        for i, (nombre, datos) in enumerate(cultivos, 1):
            try:
                print(f"\n[{i}/{total}] {nombre}")
                
                resultado['cultivos'][nombre] = self.expandir_cultivo(nombre, datos)
                
                # Guardar progreso cada 5 cultivos
                if i % 5 == 0:
                    self.guardar_progreso(resultado, archivo_salida + '.tmp')
                
                # Pausa para no saturar la API
                time.sleep(2)
                
            except KeyboardInterrupt:
                print("\n\n⚠️  Proceso interrumpido por el usuario")
                print("💾 Guardando progreso...")
                self.guardar_resultado(resultado, archivo_salida)
                return False
                
            except Exception as e:
                print(f"  ❌ Error procesando {nombre}: {e}")
                resultado['cultivos'][nombre] = datos  # Mantener original
        
        # Guardar resultado final
        self.guardar_resultado(resultado, archivo_salida)
        
        # Resumen
        print("\n" + "="*60)
        print("✨ PROCESO COMPLETADO")
        print("="*60)
        print(f"✅ Cultivos procesados: {self.cultivos_procesados}/{total}")
        print(f"💰 Costo total: ${self.costo_estimado:.2f} USD")
        print(f"📁 Archivo generado: {archivo_salida}")
        print("="*60)
        
        return True
    
    def guardar_progreso(self, datos, archivo):
        """Guarda progreso temporal"""
        with open(archivo, 'w', encoding='utf-8') as f:
            json.dump(datos, f, ensure_ascii=False, indent=2)
    
    def guardar_resultado(self, datos, archivo):
        """Guarda el resultado final"""
        with open(archivo, 'w', encoding='utf-8') as f:
            json.dump(datos, f, ensure_ascii=False, indent=2)
        
        # Calcular tamaño
        size_mb = Path(archivo).stat().st_size / (1024 * 1024)
        print(f"\n📊 Tamaño archivo: {size_mb:.2f} MB")
        
        if size_mb > 5:
            print("⚠️  ADVERTENCIA: Archivo >5MB")
            print("💡 Considera usar el optimizador para generar versión ligera")
    
    def generar_versiones_optimizadas(self, archivo_completo):
        """
        Genera versiones optimizadas del archivo completo
        """
        print("\n🪶 Generando versiones optimizadas...")
        
        with open(archivo_completo, 'r', encoding='utf-8') as f:
            datos = json.load(f)
        
        # VERSIÓN BÁSICA: Solo para listados
        basico = {
            "meta": {"version": "basico", "tipo": "listado"},
            "cultivos": {}
        }
        
        for nombre, cultivo in datos.get('cultivos', {}).items():
            stats = cultivo.get('estadisticas', {})
            rentabilidad = cultivo.get('analisis_rentabilidad', {})
            
            basico['cultivos'][nombre] = {
                "nombre": nombre,
                "categoria": cultivo.get('categoria'),
                "rendimiento": stats.get('rendimiento_promedio_t_por_ha'),
                "precio_medio": stats.get('precio_medio_mxn_ton'),
                "roi": rentabilidad.get('roi_pct'),
                "riesgo": rentabilidad.get('riesgo', 'Medio')
            }
        
        with open('cultivos_basico.json', 'w', encoding='utf-8') as f:
            json.dump(basico, f, ensure_ascii=False, separators=(',', ':'))
        
        size = Path('cultivos_basico.json').stat().st_size / 1024
        print(f"  ✅ cultivos_basico.json ({size:.1f} KB)")
        
        # VERSIÓN MEDIA: Para pantalla estadísticas
        medio = {
            "meta": datos.get('meta'),
            "cultivos": {}
        }
        
        for nombre, cultivo in datos.get('cultivos', {}).items():
            medio['cultivos'][nombre] = {
                "estadisticas": cultivo.get('estadisticas'),
                "economia": cultivo.get('economia_expandida'),
                "rentabilidad": cultivo.get('analisis_rentabilidad'),
                "alertas": cultivo.get('alertas_riesgos', [])[:3]  # Solo top 3
            }
        
        with open('cultivos_medio.json', 'w', encoding='utf-8') as f:
            json.dump(medio, f, ensure_ascii=False, indent=None, separators=(',', ':'))
        
        size = Path('cultivos_medio.json').stat().st_size / 1024
        print(f"  ✅ cultivos_medio.json ({size:.1f} KB)")
        
        # VERSIÓN POR CULTIVO: Archivos individuales
        carpeta = 'cultivos_individuales'
        Path(carpeta).mkdir(exist_ok=True)
        
        for nombre, cultivo in datos.get('cultivos', {}).items():
            archivo = f"{carpeta}/{nombre.lower().replace(' ', '_')}.json"
            with open(archivo, 'w', encoding='utf-8') as f:
                json.dump(cultivo, f, ensure_ascii=False, indent=2)
        
        print(f"  ✅ {len(datos['cultivos'])} archivos en /{carpeta}/")
        
        print("\n💡 Archivos generados:")
        print("  • cultivos_basico.json - Para navegación/listados")
        print("  • cultivos_medio.json - Para pantalla estadísticas")
        print("  • cultivos_individuales/ - Para carga bajo demanda")


# ============================================
# FUNCIONES AUXILIARES
# ============================================

def modo_prueba():
    """
    Modo prueba: procesa solo 3 cultivos para verificar
    """
    print("🧪 MODO PRUEBA - Procesando solo 3 cultivos")
    print("="*60)
    
    api_key = input("Ingresa tu API key de Anthropic: ").strip()
    
    generador = GeneradorCultivosIA(api_key=api_key)
    generador.procesar_todos(
        limite_cultivos=3,
        archivo_salida='cultivos_prueba.json'
    )

def modo_produccion():
    """
    Modo producción: procesa TODOS los cultivos
    """
    print("🚀 MODO PRODUCCIÓN - Procesando TODOS los cultivos")
    print("="*60)
    print("⚠️  ADVERTENCIA: Esto consumirá créditos de API")
    print("   Estimado: $0.15 - $0.30 USD por cultivo")
    print("   Total estimado: ~$10-15 USD para ~60 cultivos")
    print("="*60)
    
    continuar = input("\n¿Continuar? (si/no): ").strip().lower()
    if continuar != 'si':
        print("❌ Cancelado")
        return
    
    api_key = input("\nIngresa tu API key de Anthropic: ").strip()
    
    generador = GeneradorCultivosIA(api_key=api_key)
    exito = generador.procesar_todos()
    
    if exito:
        # Generar versiones optimizadas
        generador.generar_versiones_optimizadas('cultivos_expandido_ia.json')


# ============================================
# EJECUCIÓN PRINCIPAL
# ============================================

if __name__ == "__main__":
    print("\n" + "="*60)
    print("  GENERADOR AUTOMÁTICO DE CULTIVOS CON IA")
    print("  Powered by Claude (Anthropic)")
    print("="*60)
    
    print("\nOpciones:")
    print("  1. Modo Prueba (3 cultivos) - ~$1 USD")
    print("  2. Modo Producción (todos) - ~$10-15 USD")
    print("  3. Salir")
    
    opcion = input("\nSelecciona opción (1/2/3): ").strip()
    
    if opcion == "1":
        modo_prueba()
    elif opcion == "2":
        modo_produccion()
    else:
        print("👋 Hasta luego")