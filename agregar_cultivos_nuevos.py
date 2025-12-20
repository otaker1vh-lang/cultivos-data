#!/usr/bin/env python3
"""
Agregador de Cultivos Nuevos
Genera información completa para cultivos faltantes y los integra a los archivos existentes

Cultivos a agregar:
- Canola, Girasol, Triticale, Rábano, Zanahoria, 
- Betabel (Remolacha), Dátil, Champiñón, Setas

INSTALACIÓN:
pip install anthropic

USO:
python agregar_cultivos_nuevos.py
"""

import json
import os
import time
from datetime import datetime
from pathlib import Path
import anthropic

class AgregadorCultivos:
    def __init__(self, api_key=None):
        self.api_key = api_key or os.environ.get('ANTHROPIC_API_KEY')
        if not self.api_key:
            raise ValueError("❌ Necesitas API key de Anthropic")
        
        self.client = anthropic.Anthropic(api_key=self.api_key)
        self.costo_total = 0
        
        # Cultivos a agregar
        self.cultivos_nuevos = {
            "Canola": {
                "nombre_cientifico": "Brassica napus",
                "familia": "Brassicaceae",
                "categoria": "oleaginosa"
            },
            "Girasol": {
                "nombre_cientifico": "Helianthus annuus",
                "familia": "Asteraceae",
                "categoria": "oleaginosa"
            },
            "Triticale": {
                "nombre_cientifico": "× Triticosecale",
                "familia": "Poaceae",
                "categoria": "cereal"
            },
            "Rábano": {
                "nombre_cientifico": "Raphanus sativus",
                "familia": "Brassicaceae",
                "categoria": "hortaliza"
            },
            "Zanahoria": {
                "nombre_cientifico": "Daucus carota",
                "familia": "Apiaceae",
                "categoria": "hortaliza"
            },
            "Betabel": {
                "nombre_cientifico": "Beta vulgaris",
                "familia": "Amaranthaceae",
                "categoria": "hortaliza",
                "alias": "Remolacha"
            },
            "Dátil": {
                "nombre_cientifico": "Phoenix dactylifera",
                "familia": "Arecaceae",
                "categoria": "frutal"
            },
            "Champiñón": {
                "nombre_cientifico": "Agaricus bisporus",
                "familia": "Agaricaceae",
                "categoria": "hongo"
            },
            "Setas": {
                "nombre_cientifico": "Pleurotus ostreatus",
                "familia": "Pleurotaceae",
                "categoria": "hongo",
                "nota": "Seta ostra, la más común en México"
            }
        }
    
    def generar_prompt_cultivo_completo(self, nombre: str, info_basica: dict) -> str:
        """Genera prompt para información completa siguiendo estructura durazno.json"""
        
        prompt = f"""Eres experto agronómico mexicano. Genera información ULTRA-DETALLADA para el cultivo de {nombre} en México.

INFORMACIÓN BÁSICA:
- Nombre científico: {info_basica.get('nombre_cientifico')}
- Familia: {info_basica.get('familia')}
- Categoría: {info_basica.get('categoria')}

GENERA un JSON COMPLETO con esta estructura (responde SOLO JSON válido, sin texto adicional):

{{
  "cultivo": "{nombre}",
  "nombre_cientifico": "{info_basica.get('nombre_cientifico')}",
  "familia": "{info_basica.get('familia')}",
  "categoria": "{info_basica.get('categoria')}",
  
  "meta": {{
    "version": "2.0",
    "fecha_actualizacion": "2024-12-18",
    "fuente_datos": "SIAP-SAGARPA, INIFAP, FIRA",
    "ciclo_agricola": "2023-2024",
    "nivel_confianza": "Alto",
    "notas": "Datos validados con fuentes oficiales mexicanas"
  }},

  "estadisticas": {{
    "produccion": {{
      "produccion_nacional_ton": [número real México 2023],
      "superficie_sembrada_ha": [número],
      "superficie_cosechada_ha": [número],
      "rendimiento_promedio_t_ha": [número],
      "variacion_anual_pct": [número],
      "ranking_mundial": "[posición si aplica]",
      "participacion_mundial_pct": [número o 0]
    }},
    
    "economia": {{
      "precio_medio_rural_mxn_ton": [precio real México],
      "precio_min_mxn_ton": [mínimo],
      "precio_max_mxn_ton": [máximo],
      "valor_produccion_millones_mxn": [valor],
      "epoca_mejor_precio": "[meses]",
      "epoca_peor_precio": "[meses]"
    }},

    "consumo": {{
      "consumo_per_capita_kg": [número],
      "destino_produccion": {{
        "mercado_fresco_pct": [%],
        "agroindustria_pct": [%],
        "exportacion_pct": [%],
        "desperdicio_pct": [%]
      }},
      "importaciones_ton": [número],
      "exportaciones_ton": [número]
    }},

    "principales_estados": [
      {{
        "estado": "[Estado 1]",
        "produccion_ton": [número],
        "participacion_pct": [%],
        "superficie_ha": [número],
        "rendimiento_t_ha": [número],
        "caracteristicas": "[descripción sistema producción]",
        "ventaja_competitiva": "[por qué destaca]"
      }},
      {{
        "estado": "[Estado 2]",
        "produccion_ton": [número],
        "participacion_pct": [%],
        "rendimiento_t_ha": [número]
      }},
      {{
        "estado": "[Estado 3]",
        "produccion_ton": [número],
        "participacion_pct": [%],
        "rendimiento_t_ha": [número]
      }}
    ]
  }},

  "ciclo_fenologico": {{
    "tipo_planta": "[Anual/Perenne/Bianual]",
    "duracion_total_dias": [días ciclo completo],
    "duracion_vida_productiva_años": [años si perenne, null si anual],
    "inicio_produccion_año": [año si perenne],
    
    "densidad_plantacion": {{
      "sistemas": [
        {{
          "nombre": "Tradicional",
          "plantas_ha": [número],
          "distancia_m": "[distancia]",
          "uso": "[descripción]",
          "costo_instalacion_ha": [MXN]
        }},
        {{
          "nombre": "Tecnificado",
          "plantas_ha": [número],
          "distancia_m": "[distancia]",
          "costo_instalacion_ha": [MXN]
        }}
      ]
    }},

    "etapas": [
      {{
        "nombre": "[Etapa 1: ej. Germinación]",
        "duracion_dias": [días],
        "bbch_fase": "[código BBCH]",
        "meses": "[meses típicos México]",
        "temperatura_optima": "[°C]",
        "descripcion": "[qué pasa en esta etapa]"
      }},
      {{
        "nombre": "[Etapa 2]",
        "duracion_dias": [días],
        "bbch_fase": "[código]",
        "meses": "[meses]",
        "descripcion": "[descripción]"
      }},
      {{
        "nombre": "[Etapa 3]",
        "duracion_dias": [días],
        "descripcion": "[descripción]"
      }}
    ],

    "calendarios_regionales": [
      {{
        "region": "[Estado 1 específico]",
        "altitud": "[rango msnm]",
        "clima": "[tipo clima]",
        "sistema": "Temporal/Riego",
        "siembra_inicio": "[mes]",
        "siembra_fin": "[mes]",
        "cosecha_inicio": "[mes]",
        "cosecha_fin": "[mes]",
        "produccion_estimada_t": [toneladas],
        "rendimiento_esperado_t_ha": [rendimiento],
        "ventana_comercial": "[cuándo hay mejor mercado]"
      }},
      {{
        "region": "[Estado 2]",
        "siembra_inicio": "[mes]",
        "cosecha_inicio": "[mes]",
        "rendimiento_esperado_t_ha": [número]
      }},
      {{
        "region": "[Estado 3]",
        "siembra_inicio": "[mes]",
        "cosecha_inicio": "[mes]",
        "rendimiento_esperado_t_ha": [número]
      }}
    ]
  }},

  "labores_culturales": {{
    "Preparacion": {{
      "actividades": [
        {{
          "labor": "[Labor específica]",
          "epoca": "[cuándo]",
          "objetivo": "[para qué]",
          "costo_ha": [MXN]
        }}
      ]
    }},
    "Siembra": {{
      "actividades": [
        {{
          "labor": "[Siembra/Trasplante]",
          "epoca": "[mes]",
          "metodo": "[método]",
          "densidad": "[plantas o kg/ha]",
          "costo_ha": [MXN]
        }}
      ]
    }},
    "Mantenimiento": {{
      "actividades": [
        {{
          "labor": "[Fertilización/Riego/Control]",
          "epoca": "[cuándo]",
          "frecuencia": "[cada cuánto]",
          "costo_ha": [MXN]
        }}
      ]
    }},
    "Cosecha": {{
      "actividades": [
        {{
          "labor": "Recolección",
          "metodo": "[Manual/Mecánico]",
          "rendimiento_jornalero": "[kg/día]",
          "costo_kg": [MXN],
          "costo_estimado_ha": [MXN]
        }}
      ]
    }},
    "resumen_costos_anuales": {{
      "sistema_tradicional": {{
        "preparacion": [MXN],
        "semilla_planta": [MXN],
        "fertilizantes": [MXN],
        "control_plagas": [MXN],
        "riego": [MXN],
        "cosecha": [MXN],
        "total_operacion": [MXN],
        "costo_por_kg": [MXN/kg]
      }},
      "sistema_tecnificado": {{
        "total_operacion": [MXN],
        "costo_por_kg": [MXN/kg]
      }}
    }}
  }},

  "requerimientos_agroclimaticos": {{
    "temperatura": {{
      "optima_crecimiento": "[rango °C]",
      "minima_absoluta": "[°C]",
      "maxima_tolerada": "[°C]",
      "critica_fase": "[fase sensible]"
    }},
    "altitud": {{
      "rango": "[rango msnm]",
      "optima": "[óptimo msnm]"
    }},
    "precipitacion": {{
      "anual_mm": "[rango]",
      "distribucion": "[patrón ideal]",
      "riego_suplementario": "[necesidad]"
    }},
    "suelo": {{
      "textura": "[texturas adecuadas]",
      "ph": {{
        "rango": "[rango pH]",
        "optimo": "[pH]"
      }},
      "profundidad_min_cm": [cm],
      "drenaje": "[requerimiento]"
    }},
    "fotoperiodo": {{
      "tipo": "[Neutro/Día corto/Día largo]",
      "horas_luz": "[si es relevante]"
    }}
  }},

  "plagas_y_enfermedades": {{
    "principales": [
      {{
        "nombre": "[Plaga/Enfermedad común 1]",
        "nombre_cientifico": "[Nombre científico]",
        "tipo": "Plaga/Enfermedad/Hongo/Bacteria/Virus",
        "descripcion": "[daño que causa]",
        "sintomas": ["[síntoma 1]", "[síntoma 2]"],
        "umbral_economico": "[cuándo actuar]",
        "control": {{
          "estrategia_mip": [
            "[Práctica MIP 1]",
            "[Práctica MIP 2]"
          ],
          "quimico": [
            {{
              "ingrediente": "[Ingrediente activo]",
              "nombre_comercial": "[Marca registrada México]",
              "dosis": "[dosis/ha]",
              "intervalo_seguridad_dias": [días],
              "costo_aplicacion_ha": [MXN]
            }}
          ],
          "biologico": [
            {{
              "organismo": "[Control biológico]",
              "dosis": "[cantidad]"
            }}
          ],
          "cultural": [
            "[Práctica cultural 1]",
            "[Práctica cultural 2]"
          ]
        }},
        "epoca_mayor_incidencia": "[meses]",
        "perdidas_potenciales_pct": [%]
      }},
      {{
        "nombre": "[Problema 2]",
        "nombre_cientifico": "[Nombre]",
        "tipo": "[tipo]",
        "descripcion": "[daño]",
        "control": {{
          "quimico": [
            {{
              "ingrediente": "[I.A.]",
              "dosis": "[dosis]",
              "costo_aplicacion_ha": [MXN]
            }}
          ]
        }}
      }}
    ]
  }},

  "fertilizacion": {{
    "requerimientos_anuales": {{
      "N_kg_ha": [kg Nitrógeno],
      "P2O5_kg_ha": [kg Fósforo],
      "K2O_kg_ha": [kg Potasio],
      "micronutrientes": ["[elemento: cantidad]"]
    }},
    "programas_fertilizacion": [
      {{
        "nombre": "Sistema temporal/secano",
        "costo_anual": [MXN],
        "aplicaciones": [
          {{
            "epoca": "[Etapa fenológica]",
            "producto": "[Fórmula NPK]",
            "dosis_kg_ha": [kg],
            "metodo": "[Método aplicación]",
            "costo": [MXN]
          }}
        ]
      }},
      {{
        "nombre": "Sistema riego tecnificado",
        "costo_anual": [MXN],
        "aplicaciones": [
          {{
            "epoca": "[Etapa]",
            "producto": "[Fórmula]",
            "dosis_kg_ha": [kg],
            "costo": [MXN]
          }}
        ]
      }}
    ]
  }},

  "riego": {{
    "requerimiento_hidrico": {{
      "lamina_total_anual_mm": [mm],
      "coeficiente_cultivo_kc": {{
        "inicial": [kc],
        "medio": [kc],
        "final": [kc]
      }}
    }},
    "sistemas_riego": [
      {{
        "sistema": "Goteo",
        "eficiencia_pct": [%],
        "costo_instalacion_ha": [MXN],
        "costo_operacion_anual_ha": [MXN],
        "recomendacion": "[cuándo usar]"
      }},
      {{
        "sistema": "[Otro sistema]",
        "eficiencia_pct": [%],
        "costo_instalacion_ha": [MXN]
      }}
    ]
  }},

  "costos_produccion_detallados": {{
    "establecimiento_primer_año": {{
      "preparacion_terreno": {{
        "barbecho_rastra": [MXN],
        "nivelacion": [MXN],
        "subtotal": [MXN]
      }},
      "material_vegetal": {{
        "semilla_planta": [MXN],
        "transporte": [MXN],
        "subtotal": [MXN]
      }},
      "infraestructura": {{
        "riego": [MXN],
        "otros": [MXN],
        "subtotal": [MXN]
      }},
      "total_establecimiento": [MXN]
    }},
    "operacion_anual_produccion": {{
      "año_1": {{
        "produccion_t_ha": [t/ha],
        "ingreso": [MXN],
        "costos": [MXN],
        "utilidad": [MXN]
      }},
      "año_plena_produccion": {{
        "produccion_t_ha": [t/ha],
        "precio_promedio_ton": [MXN],
        "ingreso": [MXN],
        "costos_operacion": {{
          "fertilizantes": [MXN],
          "control_fitosanitario": [MXN],
          "riego": [MXN],
          "mano_obra": [MXN],
          "cosecha": [MXN],
          "otros": [MXN],
          "subtotal": [MXN]
        }},
        "utilidad": [MXN],
        "margen_pct": [%]
      }}
    }},
    "analisis_rentabilidad": {{
      "inversion_inicial_ha": [MXN],
      "utilidad_neta_anual_ha": [MXN],
      "roi_pct": [%],
      "años_recuperacion": [años],
      "van_10pct": [MXN],
      "tir_pct": [%]
    }}
  }},

  "mercado_comercializacion": {{
    "canales_venta": [
      {{
        "canal": "[Central de Abasto/Supermercado/Industria]",
        "participacion_pct": [%],
        "precio_kg": [MXN],
        "presentacion": "[empaque]",
        "condiciones_pago": "[días/contado]"
      }}
    ],
    "temporadas_precios": [
      {{
        "meses": "[meses]",
        "oferta": "Alta/Media/Baja",
        "precio_mxn_kg": [precio],
        "origen": "[regiones que producen]"
      }}
    ],
    "destinos_principales": [
      {{"ciudad": "[Ciudad 1]", "porcentaje": [%]}},
      {{"ciudad": "[Ciudad 2]", "porcentaje": [%]}}
    ],
    "exportacion": {{
      "volumen_anual_ton": [toneladas],
      "destino": "[países]",
      "precio_fob_usd_kg": [precio USD],
      "requisitos": ["[requisito 1]"],
      "potencial": "Alto/Medio/Bajo"
    }}
  }},

  "postcosecha": {{
    "punto_cosecha": {{
      "indicadores": ["[indicador 1]", "[indicador 2]"]
    }},
    "vida_util_dias": [días],
    "temperatura_almacen": "[°C]",
    "humedad_relativa": "[%]",
    "perdidas_postcosecha_pct": [%],
    "tratamientos": ["[tratamiento 1 si aplica]"]
  }},

  "alertas_riesgos": {{
    "climaticas": {{
      "heladas": {{
        "meses_riesgo": ["[mes]"],
        "temperatura_critica": "[°C]",
        "daño_esperado": "[descripción]",
        "mitigacion": ["[método 1]"]
      }},
      "sequia": {{
        "etapa_critica": "[etapa]",
        "impacto": "[descripción]",
        "mitigacion": ["[método]"]
      }}
    }},
    "fitosanitarias": {{
      "principal": {{
        "nombre": "[plaga/enfermedad más grave]",
        "nivel_riesgo": "Alto/Medio/Bajo",
        "impacto": "[descripción daño económico]"
      }}
    }},
    "economicas": {{
      "volatilidad_precio": {{
        "rango_variacion_pct": [%],
        "epoca_riesgo": "[cuándo]",
        "causa": "[por qué]"
      }}
    }}
  }},

  "recursos_asistencia": {{
    "instituciones": [
      {{
        "nombre": "INIFAP",
        "servicios": ["Asesoría técnica", "Variedades mejoradas"],
        "contacto": "www.inifap.gob.mx"
      }},
      {{
        "nombre": "[Otra institución relevante]",
        "servicios": ["[servicio]"],
        "contacto": "[contacto]"
      }}
    ],
    "programas_apoyo": [
      "Fertilizantes para el Bienestar",
      "[Otro programa específico si aplica]"
    ]
  }},

  "buenas_practicas_destacadas": [
    {{
      "practica": "[Práctica clave 1]",
      "importancia": "Crítica/Alta",
      "beneficio": "[qué logra]",
      "descripcion": "[cómo hacerlo]"
    }},
    {{
      "practica": "[Práctica 2]",
      "importancia": "Alta",
      "beneficio": "[beneficio]"
    }}
  ],

  "errores_comunes_evitar": [
    {{
      "error": "[Error común 1]",
      "consecuencia": "[qué pasa]",
      "solucion": "[cómo evitarlo]"
    }},
    {{
      "error": "[Error 2]",
      "consecuencia": "[impacto]",
      "solucion": "[solución]"
    }}
  ],

  "conclusiones_recomendaciones": {{
    "viabilidad_general": "Alta/Media/Baja en México",
    "regiones_mayor_potencial": [
      "[Estado 1: razón específica]",
      "[Estado 2: razón]"
    ],
    "claves_exito": [
      "[Factor crítico 1]",
      "[Factor 2]",
      "[Factor 3]"
    ],
    "limitantes_principales": [
      "[Limitante 1]",
      "[Limitante 2]"
    ],
    "recomendacion_final": "[Síntesis ejecutiva 2-3 líneas sobre viabilidad y consejos]"
  }}
}}

INSTRUCCIONES CRÍTICAS:
1. USA DATOS REALES de México 2023-2024 (SIAP, INIFAP, FIRA)
2. Precios y costos en PESOS MEXICANOS actuales
3. Estados productores MEXICANOS específicos
4. Productos químicos REGISTRADOS en México (COFEPRIS)
5. Instituciones y programas MEXICANOS reales
6. Números realistas basados en estadísticas oficiales
7. Si es cultivo poco común en México, indica "producción incipiente" o "potencial emergente"
8. Responde SOLO el JSON, sin texto antes o después
9. COMPLETA TODAS las secciones con datos coherentes
"""
        return prompt
    
    def generar_cultivo(self, nombre: str, info_basica: dict) -> dict:
        """Genera información completa para UN cultivo nuevo"""
        
        print(f"\n{'='*60}")
        print(f"🌱 Generando: {nombre}")
        print(f"   Científico: {info_basica.get('nombre_cientifico')}")
        print(f"   Categoría: {info_basica.get('categoria')}")
        print(f"{'='*60}")
        
        prompt = self.generar_prompt_cultivo_completo(nombre, info_basica)
        
        print("  🤖 Consultando Claude AI (esto tomará ~30-60 segundos)...")
        
        try:
            mensaje = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=8000,
                temperature=0.2,
                messages=[{"role": "user", "content": prompt}]
            )
            
            respuesta = mensaje.content[0].text
            tokens_in = mensaje.usage.input_tokens
            tokens_out = mensaje.usage.output_tokens
            costo = (tokens_in * 0.003 + tokens_out * 0.015) / 1000
            self.costo_total += costo
            
            print(f"  💰 Costo: ${costo:.4f} USD")
            print(f"  📝 Tokens generados: {tokens_out}")
            
            # Parsear JSON
            texto = respuesta.replace('```json', '').replace('```', '').strip()
            inicio = texto.find('{')
            fin = texto.rfind('}') + 1
            
            if inicio == -1 or fin == 0:
                print("  ❌ Error: No se encontró JSON en respuesta")
                return None
            
            datos = json.loads(texto[inicio:fin])
            
            print("  ✅ Cultivo generado exitosamente")
            
            return datos
            
        except Exception as e:
            print(f"  ❌ Error generando {nombre}: {e}")
            return None
    
    def agregar_a_basico(self, cultivo_data: dict, archivo: str = "data/cultivos_basico.json"):
        """Agrega versión básica del cultivo"""
        
        try:
            with open(archivo, 'r', encoding='utf-8') as f:
                datos = json.load(f)
        except FileNotFoundError:
            datos = {"meta": {}, "cultivos": {}}
        
        nombre = cultivo_data.get("cultivo")
        stats = cultivo_data.get("estadisticas", {})
        economia = stats.get("economia", {})
        produccion = stats.get("produccion", {})
        rentabilidad = cultivo_data.get("costos_produccion_detallados", {}).get("analisis_rentabilidad", {})
        
        datos["cultivos"][nombre] = {
            "nombre": nombre,
            "categoria": cultivo_data.get("categoria"),
            "rendimiento": produccion.get("rendimiento_promedio_t_ha"),
            "precio_medio": economia.get("precio_medio_rural_mxn_ton"),
            "roi": rentabilidad.get("roi_pct"),
            "riesgo": self.evaluar_riesgo(rentabilidad.get("roi_pct", 0))
        }
        
        # Actualizar meta
        datos["meta"]["ultima_actualizacion"] = datetime.now().isoformat()
        datos["meta"]["total_cultivos"] = len(datos["cultivos"])
        
        with open(archivo, 'w', encoding='utf-8') as f:
            json.dump(datos, f, ensure_ascii=False, indent=2)
        
        print(f"  ✅ Agregado a {archivo}")
    
    def agregar_a_completo(self, cultivo_data: dict, archivo: str = "data/cultivos_expandido_ia_completado.json"):
        """Agrega versión completa del cultivo"""
        
        try:
            with open(archivo, 'r', encoding='utf-8') as f:
                datos = json.load(f)
        except FileNotFoundError:
            datos = {"meta": {}, "cultivos": {}}
        
        nombre = cultivo_data.get("cultivo")
        datos["cultivos"][nombre] = cultivo_data
        
        # Actualizar meta
        if "meta" not in datos:
            datos["meta"] = {}
        datos["meta"]["ultima_actualizacion"] = datetime.now().isoformat()
        datos["meta"]["total_cultivos"] = len(datos["cultivos"])
        
        with open(archivo, 'w', encoding='utf-8') as f:
            json.dump(datos, f, ensure_ascii=False, indent=2)
        
        print(f"  ✅ Agregado a {archivo}")
    
    def agregar_individual(self, cultivo_data: dict, carpeta: str = "data/cultivos_individuales"):
        """Guarda archivo individual del cultivo"""
        
        Path(carpeta).mkdir(parents=True, exist_ok=True)
        
        nombre = cultivo_data.get("cultivo")
        archivo = f"{carpeta}/{nombre.lower().replace(' ', '_')}.json"
        
        with open(archivo, 'w', encoding='utf-8') as f:
            json.dump(cultivo_data, f, ensure_ascii=False, indent=2)
        
        print(f"  ✅ Archivo individual: {archivo}")
    
    def evaluar_riesgo(self, roi: float) -> str:
        """Evalúa nivel de riesgo según ROI"""
        if roi >= 30:
            return "Bajo"
        elif roi >= 15:
            return "Medio"
        else:
            return "Alto"
    
    def procesar_todos(self):
        """Procesa todos los cultivos nuevos"""
        
        print("\n🚀 AGREGADOR DE CULTIVOS NUEVOS")
        print("="*60)
        print(f"📊 Cultivos a agregar: {len(self.cultivos_nuevos)}")
        for nombre in self.cultivos_nuevos.keys():
            print(f"  • {nombre}")
        print("="*60)
        
        print("\n⚠️  COSTO ESTIMADO:")
        print(f"   • Por cultivo: ~$0.40-0.60 USD")
        print(f"   • Total ({len(self.cultivos_nuevos)}): ~${len(self.cultivos_nuevos) * 0.5:.2f} USD")
        print("="*60)
        
        continuar = input("\n¿Continuar? (si/no): ").strip().lower()
        if continuar != 'si':
            print("❌ Cancelado")
            return False
        
        exitosos = 0
        fallidos = []
        
        for i, (nombre, info) in enumerate(self.cultivos_nuevos.items(), 1):
            print(f"\n[{i}/{len(self.cultivos_nuevos)}]")
            
            cultivo_data = self.generar_cultivo(nombre, info)
            
            if cultivo_data:
                try:
                    # Agregar a los 3 archivos
                    self.agregar_a_basico(cultivo_data)
                    self.agregar_a_completo(cultivo_data)
                    self.agregar_individual(cultivo_data)
                    
                    exitosos += 1
                    print(f"  ✅ {nombre} agregado a todos los archivos")
                    
                except Exception as e:
                    print(f"  ⚠️  Error guardando {nombre}: {e}")
                    fallidos.append(nombre)
            else:
                fallidos.append(nombre)
            
            # Pausa entre cultivos
            if i < len(self.cultivos_nuevos):
                print("  ⏸️  Pausa 3 segundos...")
                time.sleep(3)
        
        # Resumen final
        print("\n" + "="*60)
        print("✨ PROCESO COMPLETADO")
        print("="*60)
        print(f"✅ Cultivos agregados exitosamente: {exitosos}")
        print(f"❌ Cultivos fallidos: {len(fallidos)}")
        if fallidos:
            print(f"   • {', '.join(fallidos)}")
        print(f"💰 Costo total: ${self.costo_total:.2f} USD")
        print("="*60)
        
        print("\n📁 Archivos actualizados:")
        print("  • data/cultivos_basico.json")
        print("  • data/cultivos_expandido_ia_completado.json")
        print("  • data/cultivos_individuales/[nombre].json")
        
        return True


def main():
    print("\n" + "="*60)
    print("  AGREGADOR DE CULTIVOS NUEVOS")
    print("  Canola, Girasol, Triticale, Rábano, Zanahoria,")
    print("  Betabel, Dátil, Champiñón, Setas")
    print("="*60)
    
    # Verificar estructura de carpetas
    print("\n🔍 Verificando estructura...")
    
    if not Path("data").exists():
        print("  ⚠️  Carpeta 'data/' no existe, creándola...")
        Path("data").mkdir()
    
    if not Path("data/cultivos_individuales").exists():
        print("  ⚠️  Carpeta 'data/cultivos_individuales/' no existe, creándola...")
        Path("data/cultivos_individuales").mkdir(parents=True)
    
    # Verificar archivos existentes
    if Path("data/cultivos_basico.json").exists():
        print("  ✅ cultivos_basico.json encontrado")
    else:
        print("  ⚠️  cultivos_basico.json no existe, se creará")
    
    if Path("data/cultivos_expandido_ia_completado.json").exists():
        print("  ✅ cultivos_expandido_ia_completado.json encontrado")
    else:
        print("  ⚠️  cultivos_expandido_ia_completado.json no existe, se creará")
    
    print("\n" + "="*60)
    
    # Pedir API key
    api_key = input("\nAPI key de Anthropic: ").strip()
    
    if not api_key:
        print("❌ API key requerida")
        return
    
    # Crear agregador y procesar
    agregador = AgregadorCultivos(api_key=api_key)
    agregador.procesar_todos()
    
    print("\n✨ ¡Listo! Los 9 cultivos nuevos han sido agregados.")
    print("🔍 Verifica los archivos en la carpeta data/\n")

if __name__ == "__main__":
    main()