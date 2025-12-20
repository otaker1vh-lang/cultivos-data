#!/usr/bin/env python3
"""
Completador Inteligente de Cultivos
Solo genera la información FALTANTE comparando con durazno.json

VENTAJAS:
- Ahorra 70-80% en costos de API
- Procesa solo lo necesario
- Mantiene datos existentes intactos

INSTALACIÓN:
pip install anthropic

USO:
python completar_cultivos.py cultivos_actual.json
"""

import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
import anthropic
from typing import Dict, List, Any

class CompletadorCultivos:
    def __init__(self, api_key=None):
        self.api_key = api_key or os.environ.get('ANTHROPIC_API_KEY')
        if not self.api_key:
            raise ValueError("❌ Necesitas API key de Anthropic")
        
        self.client = anthropic.Anthropic(api_key=self.api_key)
        self.estructura_completa = self.cargar_estructura_referencia()
        self.cultivos_procesados = 0
        self.costo_total = 0
        
    def cargar_estructura_referencia(self):
        """Carga durazno.json como referencia de estructura completa"""
        try:
            with open('durazno.json', 'r', encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            print("⚠️  No se encontró durazno.json - usando estructura predefinida")
            return self.estructura_predefinida()
    
    def estructura_predefinida(self):
        """Estructura mínima si no hay durazno.json"""
        return {
            "meta": {},
            "estadisticas": {
                "produccion": {},
                "economia": {},
                "principales_estados": []
            },
            "ciclo_fenologico": {
                "etapas": [],
                "calendarios_regionales": [],
                "densidad_plantacion": {}
            },
            "labores_culturales": {},
            "requerimientos_agroclimaticos": {},
            "plagas_y_enfermedades": {"principales": [], "secundarias": []},
            "fertilizacion": {"programas_fertilizacion": []},
            "riego": {"sistemas_riego": []},
            "costos_produccion_detallados": {},
            "mercado_comercializacion": {},
            "postcosecha": {},
            "alertas_riesgos": {},
            "recursos_asistencia": {},
            "buenas_practicas_destacadas": [],
            "errores_comunes_evitar": [],
            "conclusiones_recomendaciones": {}
        }
    
    def analizar_faltantes(self, cultivo_data: Dict) -> Dict[str, Any]:
        """
        Analiza qué secciones faltan o están incompletas
        Retorna dict con análisis detallado
        """
        faltantes = {
            "secciones_ausentes": [],
            "secciones_vacias": [],
            "secciones_incompletas": [],
            "detalles": {}
        }
        
        # Secciones principales requeridas
        secciones_requeridas = {
            "meta": ["version", "fecha_actualizacion", "fuente_datos"],
            "estadisticas": ["produccion", "economia", "principales_estados"],
            "ciclo_fenologico": ["etapas", "calendarios_regionales", "densidad_plantacion"],
            "labores_culturales": ["resumen_costos_anuales"],
            "requerimientos_agroclimaticos": ["temperatura", "suelo", "precipitacion"],
            "plagas_y_enfermedades": ["principales"],
            "fertilizacion": ["requerimientos_anuales", "programas_fertilizacion"],
            "riego": ["requerimiento_hidrico", "sistemas_riego"],
            "costos_produccion_detallados": ["establecimiento_primer_año", "operacion_anual_produccion"],
            "mercado_comercializacion": ["canales_venta", "temporadas_precios"],
            "postcosecha": ["punto_cosecha", "vida_util_dias"],
            "alertas_riesgos": ["climaticas", "fitosanitarias", "economicas"],
            "recursos_asistencia": ["instituciones"],
            "buenas_practicas_destacadas": [],
            "errores_comunes_evitar": [],
            "conclusiones_recomendaciones": {}
        }
        
        for seccion, subsecciones in secciones_requeridas.items():
            # Sección ausente completamente
            if seccion not in cultivo_data:
                faltantes["secciones_ausentes"].append(seccion)
                faltantes["detalles"][seccion] = "Sección completa ausente"
                continue
            
            datos_seccion = cultivo_data[seccion]
            
            # Sección vacía
            if not datos_seccion or (isinstance(datos_seccion, (list, dict)) and len(datos_seccion) == 0):
                faltantes["secciones_vacias"].append(seccion)
                faltantes["detalles"][seccion] = "Sección vacía"
                continue
            
            # Verificar subsecciones SOLO SI datos_seccion es un dict
            if isinstance(subsecciones, list) and len(subsecciones) > 0 and isinstance(datos_seccion, dict):
                subsec_faltantes = []
                for subsec in subsecciones:
                    if subsec not in datos_seccion or not datos_seccion[subsec]:
                        subsec_faltantes.append(subsec)
                
                if subsec_faltantes:
                    faltantes["secciones_incompletas"].append(seccion)
                    faltantes["detalles"][seccion] = f"Faltan: {', '.join(subsec_faltantes)}"
        
        # Análisis detallado de plagas (con validación de tipos)
        if "plagas_y_enfermedades" in cultivo_data:
            plagas_enf = cultivo_data["plagas_y_enfermedades"]
            
            # Verificar que sea dict antes de usar .get()
            if isinstance(plagas_enf, dict):
                plagas = plagas_enf.get("principales", [])
                if isinstance(plagas, list) and plagas:
                    plagas_sin_control = []
                    for i, plaga in enumerate(plagas):
                        if isinstance(plaga, dict):
                            if "control" not in plaga or not plaga.get("control"):
                                plagas_sin_control.append(plaga.get("nombre", f"Plaga {i+1}"))
                    
                    if plagas_sin_control:
                        faltantes["detalles"]["plagas_sin_control_detallado"] = plagas_sin_control
        
        # Análisis de calendarios regionales (con validación)
        if "ciclo_fenologico" in cultivo_data:
            ciclo = cultivo_data["ciclo_fenologico"]
            if isinstance(ciclo, dict):
                calendarios = ciclo.get("calendarios_regionales", [])
                if isinstance(calendarios, list) and len(calendarios) < 3:
                    faltantes["detalles"]["calendarios_insuficientes"] = f"Solo {len(calendarios)} de 3-5 recomendados"
        
        return faltantes
    
    def generar_prompt_faltantes(self, nombre_cultivo: str, 
                                  cultivo_data: Dict, 
                                  faltantes: Dict) -> str:
        """Genera prompt SOLO para información faltante"""
        
        # Preparar contexto de lo que YA existe
        contexto_existente = []
        if "estadisticas" in cultivo_data:
            stats = cultivo_data["estadisticas"]
            contexto_existente.append(f"Rendimiento: {stats.get('rendimiento_promedio_t_por_ha', 'N/A')} t/ha")
            contexto_existente.append(f"Precio: ${stats.get('precio_medio_mxn_ton', 'N/A')} MXN/ton")
        
        # Determinar qué generar
        secciones_generar = []
        secciones_generar.extend(faltantes["secciones_ausentes"])
        secciones_generar.extend(faltantes["secciones_vacias"])
        secciones_generar.extend(faltantes["secciones_incompletas"])
        
        if not secciones_generar:
            return None  # Nada que generar
        
        prompt = f"""Eres experto agronómico mexicano. Completa SOLO la información FALTANTE para {nombre_cultivo}.

CONTEXTO EXISTENTE:
{chr(10).join(contexto_existente)}

INFORMACIÓN QUE FALTA (generar SOLO esto):
{chr(10).join([f"- {s}: {faltantes['detalles'].get(s, 'completar')}" for s in secciones_generar])}

GENERA un JSON con SOLO las secciones faltantes. Ejemplo de estructura:

{{"""

        # Generar estructura SOLO para lo que falta
        if "meta" in secciones_generar:
            prompt += '''
  "meta": {
    "version": "2.0",
    "fecha_actualizacion": "2024-12-15",
    "fuente_datos": "SIAP-SAGARPA, INIFAP",
    "nivel_confianza": "Alto"
  },'''
        
        if "ciclo_fenologico" in secciones_generar:
            prompt += '''
  "ciclo_fenologico": {
    "duracion_total_dias": [número],
    "etapas": [
      {
        "nombre": "[Etapa]",
        "duracion_dias": [días],
        "bbch_fase": "[código]",
        "meses": "[meses]",
        "temperatura_optima": "[°C]",
        "descripcion": "[detalle]"
      }
    ],
    "calendarios_regionales": [
      {
        "region": "[Estado específico]",
        "altitud": "[msnm]",
        "siembra_inicio": "[mes]",
        "siembra_fin": "[mes]",
        "cosecha_inicio": "[mes]",
        "cosecha_fin": "[mes]",
        "rendimiento_esperado_t_ha": [número],
        "ventana_comercial": "[descripción]"
      }
    ],
    "densidad_plantacion": {
      "sistemas": [
        {
          "nombre": "[Tradicional/Tecnificado]",
          "plantas_ha": [número],
          "distancia_m": "[dist]",
          "costo_instalacion_ha": [MXN]
        }
      ]
    }
  },'''
        
        if "labores_culturales" in secciones_generar:
            prompt += '''
  "labores_culturales": {
    "Preparacion": {
      "actividades": [
        {
          "labor": "[nombre]",
          "epoca": "[cuándo]",
          "costo_ha": [MXN]
        }
      ]
    },
    "Siembra": {
      "actividades": [{"labor": "[labor]", "costo_ha": [MXN]}]
    },
    "Mantenimiento": {
      "actividades": [{"labor": "[labor]", "epoca": "[cuándo]", "costo_ha": [MXN]}]
    },
    "Cosecha": {
      "actividades": [
        {
          "labor": "Recolección",
          "rendimiento_jornalero": "[kg/día]",
          "costo_kg": [MXN]
        }
      ]
    },
    "resumen_costos_anuales": {
      "sistema_tradicional": {
        "preparacion": [MXN],
        "fertilizantes": [MXN],
        "control_plagas": [MXN],
        "riego": [MXN],
        "cosecha": [MXN],
        "total_operacion": [MXN],
        "costo_por_kg": [MXN]
      }
    }
  },'''
        
        if "plagas_y_enfermedades" in secciones_generar or "plagas_sin_control_detallado" in faltantes["detalles"]:
            prompt += '''
  "plagas_y_enfermedades": {
    "principales": [
      {
        "nombre": "[Nombre común]",
        "nombre_cientifico": "[Científico]",
        "tipo": "Plaga/Enfermedad",
        "descripcion": "[daño]",
        "sintomas": ["[síntoma 1]"],
        "umbral_economico": "[cuándo controlar]",
        "control": {
          "estrategia_mip": ["[práctica 1]"],
          "quimico": [
            {
              "ingrediente": "[I.A.]",
              "nombre_comercial": "[Marca México]",
              "dosis": "[dosis/ha]",
              "intervalo_seguridad_dias": [días],
              "costo_aplicacion_ha": [MXN]
            }
          ],
          "biologico": [{"organismo": "[nombre]", "dosis": "[cantidad]"}],
          "cultural": ["[práctica 1]"]
        },
        "epoca_mayor_incidencia": "[meses]",
        "perdidas_potenciales_pct": [%]
      }
    ]
  },'''
        
        if "costos_produccion_detallados" in secciones_generar:
            prompt += '''
  "costos_produccion_detallados": {
    "establecimiento_primer_año": {
      "preparacion_terreno": {
        "barbecho": [MXN],
        "nivelacion": [MXN],
        "subtotal": [MXN]
      },
      "material_vegetal": [MXN],
      "infraestructura": {
        "riego": [MXN],
        "subtotal": [MXN]
      },
      "total_establecimiento": [MXN]
    },
    "operacion_anual_produccion": {
      "año_plena_produccion": {
        "produccion_t_ha": [número],
        "ingreso": [MXN],
        "costos_operacion": {
          "fertilizantes": [MXN],
          "control_fitosanitario": [MXN],
          "riego": [MXN],
          "cosecha": [MXN],
          "subtotal": [MXN]
        },
        "utilidad": [MXN],
        "margen_pct": [%]
      }
    },
    "analisis_rentabilidad": {
      "inversion_inicial_ha": [MXN],
      "utilidad_neta_anual_ha": [MXN],
      "roi_pct": [%],
      "años_recuperacion": [años]
    }
  },'''
        
        if "mercado_comercializacion" in secciones_generar:
            prompt += '''
  "mercado_comercializacion": {
    "canales_venta": [
      {
        "canal": "[Central/Supermercado]",
        "participacion_pct": [%],
        "precio_kg": [MXN],
        "pago": "[condiciones]"
      }
    ],
    "temporadas_precios": [
      {
        "meses": "[meses]",
        "oferta": "Alta/Media/Baja",
        "precio_mxn_kg": [precio]
      }
    ]
  },'''
        
        if "postcosecha" in secciones_generar:
            prompt += '''
  "postcosecha": {
    "punto_cosecha": {
      "indicadores": ["[indicador 1]"]
    },
    "vida_util_dias": [días],
    "temperatura_almacen": "[°C]",
    "humedad_relativa": "[%]",
    "perdidas_postcosecha_pct": [%]
  },'''
        
        if "alertas_riesgos" in secciones_generar:
            prompt += '''
  "alertas_riesgos": {
    "climaticas": {
      "heladas": {
        "temperatura_critica": "[°C]",
        "meses_riesgo": ["[mes]"],
        "mitigacion": ["[método]"]
      },
      "sequia": {
        "etapa_critica": "[etapa]",
        "mitigacion": ["[método]"]
      }
    },
    "fitosanitarias": {
      "principal": {
        "nombre": "[plaga/enfermedad]",
        "nivel": "[riesgo]",
        "impacto": "[descripción]"
      }
    },
    "economicas": {
      "volatilidad_precio": {
        "epoca": "[cuándo]",
        "causa": "[por qué]"
      }
    }
  },'''
        
        if "recursos_asistencia" in secciones_generar:
            prompt += '''
  "recursos_asistencia": {
    "instituciones": [
      {
        "nombre": "[INIFAP/FIRA/SAGARPA]",
        "servicios": ["[servicio 1]"],
        "contacto": "[teléfono/web]"
      }
    ],
    "programas_apoyo": ["[programa 1]"]
  },'''
        
        if "buenas_practicas_destacadas" in secciones_generar:
            prompt += '''
  "buenas_practicas_destacadas": [
    {
      "practica": "[nombre]",
      "importancia": "Crítica/Alta",
      "beneficio": "[qué logra]"
    }
  ],'''
        
        if "errores_comunes_evitar" in secciones_generar:
            prompt += '''
  "errores_comunes_evitar": [
    {
      "error": "[error]",
      "consecuencia": "[qué pasa]",
      "solucion": "[cómo evitar]"
    }
  ],'''
        
        if "conclusiones_recomendaciones" in secciones_generar:
            prompt += '''
  "conclusiones_recomendaciones": {
    "viabilidad_general": "[Alta/Media/Baja]",
    "regiones_mayor_potencial": ["[región: razón]"],
    "claves_exito": ["[clave 1]"],
    "limitantes_principales": ["[limitante 1]"],
    "recomendacion_final": "[síntesis]"
  }'''
        
        prompt += '''
}

INSTRUCCIONES:
1. USA DATOS REALES de México (SIAP, INIFAP 2023-2024)
2. Precios en PESOS MEXICANOS actuales
3. Productos REGISTRADOS en México
4. Instituciones MEXICANAS reales
5. Responde SOLO el JSON, sin texto adicional
6. COMPLETA todas las secciones listadas arriba
'''
        
        return prompt
    
    def llamar_claude(self, prompt: str) -> tuple:
        """Llama a API con manejo de errores"""
        try:
            mensaje = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=6000,
                temperature=0.2,
                messages=[{"role": "user", "content": prompt}]
            )
            
            respuesta = mensaje.content[0].text
            tokens_in = mensaje.usage.input_tokens
            tokens_out = mensaje.usage.output_tokens
            costo = (tokens_in * 0.003 + tokens_out * 0.015) / 1000
            
            return respuesta, costo
            
        except Exception as e:
            print(f"  ❌ Error API: {e}")
            return None, 0
    
    def parsear_json(self, texto: str) -> Dict:
        """Parsea JSON limpiando markdown"""
        try:
            texto = texto.replace('```json', '').replace('```', '').strip()
            inicio = texto.find('{')
            fin = texto.rfind('}') + 1
            
            if inicio == -1 or fin == 0:
                return None
            
            return json.loads(texto[inicio:fin])
            
        except json.JSONDecodeError as e:
            print(f"  ❌ Error JSON: {e}")
            return None
    
    def completar_cultivo(self, nombre: str, cultivo_data: Dict) -> Dict:
        """Completa la información faltante de UN cultivo"""
        
        print(f"\n{'='*60}")
        print(f"🔍 Analizando: {nombre}")
        
        # Validar que cultivo_data sea un dict
        if not isinstance(cultivo_data, dict):
            print(f"  ⚠️  ERROR: Datos no son dict, son {type(cultivo_data)}")
            print(f"  📋 Contenido: {str(cultivo_data)[:200]}...")
            return cultivo_data if isinstance(cultivo_data, dict) else {}
        
        try:
            # Analizar qué falta
            faltantes = self.analizar_faltantes(cultivo_data)
            
            total_faltantes = (
                len(faltantes["secciones_ausentes"]) +
                len(faltantes["secciones_vacias"]) +
                len(faltantes["secciones_incompletas"])
            )
            
            if total_faltantes == 0:
                print("  ✅ Cultivo completo - sin cambios")
                return cultivo_data
            
            print(f"  📋 Secciones a completar: {total_faltantes}")
            for seccion in faltantes["secciones_ausentes"]:
                print(f"    • {seccion}: ❌ Ausente")
            for seccion in faltantes["secciones_vacias"]:
                print(f"    • {seccion}: ⚠️  Vacía")
            for seccion in faltantes["secciones_incompletas"]:
                print(f"    • {seccion}: ⚠️  {faltantes['detalles'][seccion]}")
            
            # Generar prompt
            prompt = self.generar_prompt_faltantes(nombre, cultivo_data, faltantes)
            if not prompt:
                return cultivo_data
            
            # Llamar API
            print("  🤖 Generando información faltante...")
            respuesta, costo = self.llamar_claude(prompt)
            self.costo_total += costo
            
            if not respuesta:
                print("  ❌ Error generando")
                return cultivo_data
            
            print(f"  💰 Costo: ${costo:.4f} USD")
            
            # Parsear respuesta
            datos_nuevos = self.parsear_json(respuesta)
            if not datos_nuevos:
                print("  ❌ Error parseando")
                return cultivo_data
            
            # COMBINAR datos existentes + nuevos
            resultado = self.merge_deep(cultivo_data, datos_nuevos)
            
            print(f"  ✅ Completado exitosamente")
            self.cultivos_procesados += 1
            
            return resultado
            
        except Exception as e:
            print(f"  ❌ Error inesperado: {e}")
            import traceback
            print(f"  🔍 Traceback: {traceback.format_exc()[:300]}...")
            return cultivo_data
    
    def merge_deep(self, original: Dict, nuevo: Dict) -> Dict:
        """Merge profundo: mantiene original, agrega nuevo"""
        resultado = original.copy()
        
        for key, value in nuevo.items():
            if key in resultado:
                # Si ambos son dict, merge recursivo
                if isinstance(resultado[key], dict) and isinstance(value, dict):
                    resultado[key] = self.merge_deep(resultado[key], value)
                # Si ambos son list, combinar sin duplicar
                elif isinstance(resultado[key], list) and isinstance(value, list):
                    # Para listas de objetos (como plagas), evitar duplicados
                    if resultado[key] and isinstance(resultado[key][0], dict):
                        nombres_existentes = {
                            item.get('nombre', item.get('labor', str(i))) 
                            for i, item in enumerate(resultado[key])
                        }
                        for item in value:
                            if item.get('nombre', item.get('labor')) not in nombres_existentes:
                                resultado[key].append(item)
                    else:
                        resultado[key].extend(value)
                # Si original vacío, reemplazar
                elif not resultado[key]:
                    resultado[key] = value
                # Si es valor simple y original existe, mantener original
            else:
                # Key nueva, agregar
                resultado[key] = value
        
        return resultado
    
    def procesar_archivo(self, archivo_entrada: str, 
                        archivo_salida: str = None,
                        limite: int = None):
        """Procesa archivo completo"""
        
        if not archivo_salida:
            base = Path(archivo_entrada).stem
            archivo_salida = f"{base}_completado.json"
        
        print("\n🔧 COMPLETADOR INTELIGENTE DE CULTIVOS")
        print("="*60)
        print(f"📂 Entrada: {archivo_entrada}")
        print(f"📝 Salida: {archivo_salida}")
        print(f"📖 Referencia: durazno.json")
        print("="*60)
        
        # Cargar archivo
        try:
            with open(archivo_entrada, 'r', encoding='utf-8') as f:
                datos = json.load(f)
        except FileNotFoundError:
            print(f"❌ No se encontró {archivo_entrada}")
            return False
        
        cultivos = datos.get('cultivos', {})
        if limite:
            items = list(cultivos.items())[:limite]
            cultivos = dict(items)
            print(f"⚠️  MODO PRUEBA: {limite} cultivos\n")
        
        total = len(cultivos)
        print(f"📊 Total cultivos: {total}\n")
        
        # Procesar cada cultivo
        resultado = {
            "meta": {
                **datos.get('meta', {}),
                "ultima_actualizacion": datetime.now().isoformat(),
                "completado_con": "Completador v2.0"
            },
            "cultivos": {}
        }
        
        for i, (nombre, cultivo_data) in enumerate(cultivos.items(), 1):
            try:
                print(f"[{i}/{total}]")
                resultado['cultivos'][nombre] = self.completar_cultivo(nombre, cultivo_data)
                
                # Guardar progreso cada 5
                if i % 5 == 0:
                    with open(archivo_salida + '.tmp', 'w', encoding='utf-8') as f:
                        json.dump(resultado, f, ensure_ascii=False, indent=2)
                    print("  💾 Progreso guardado")
                
                time.sleep(2)
                
            except KeyboardInterrupt:
                print("\n⚠️  Interrumpido - guardando...")
                with open(archivo_salida, 'w', encoding='utf-8') as f:
                    json.dump(resultado, f, ensure_ascii=False, indent=2)
                return False
            except Exception as e:
                print(f"  ❌ Error: {e}")
                resultado['cultivos'][nombre] = cultivo_data
        
        # Guardar resultado final
        with open(archivo_salida, 'w', encoding='utf-8') as f:
            json.dump(resultado, f, ensure_ascii=False, indent=2)
        
        # Resumen
        print("\n" + "="*60)
        print("✨ COMPLETADO")
        print("="*60)
        print(f"✅ Cultivos procesados: {self.cultivos_procesados}/{total}")
        print(f"💰 Costo total: ${self.costo_total:.2f} USD")
        print(f"💾 Ahorro vs generación completa: ~{((1 - self.costo_total/30)*100):.0f}%")
        
        size_mb = Path(archivo_salida).stat().st_size / (1024 * 1024)
        print(f"📦 Tamaño: {size_mb:.2f} MB")
        print(f"📝 Archivo: {archivo_salida}")
        print("="*60)
        
        return True


def main():
    print("\n" + "="*60)
    print("  COMPLETADOR INTELIGENTE DE CULTIVOS")
    print("  Solo completa lo que falta")
    print("="*60)
    
    if len(sys.argv) < 2:
        print("\nUSO:")
        print("  python completar_cultivos.py archivo.json")
        print("\nEJEMPLOS:")
        print("  python completar_cultivos.py cultivos.json")
        print("  python completar_cultivos.py mi_archivo.json --prueba")
        return
    
    archivo = sys.argv[1]
    modo_prueba = "--prueba" in sys.argv or "-p" in sys.argv
    
    api_key = input("\nAPI key de Anthropic: ").strip()
    
    completador = CompletadorCultivos(api_key=api_key)
    
    if modo_prueba:
        print("\n🧪 MODO PRUEBA: Procesando 3 cultivos")
        completador.procesar_archivo(archivo, limite=3)
    else:
        print("\n⚠️  Esto completará TODOS los cultivos")
        print("   Costo estimado: $5-15 USD (70-80% menos que generación completa)")
        
        continuar = input("\n¿Continuar? (si/no): ").strip().lower()
        if continuar == 'si':
            completador.procesar_archivo(archivo)
        else:
            print("❌ Cancelado")

if __name__ == "__main__":
    main()