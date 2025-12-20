#!/usr/bin/env python3
"""
Diagnóstico de estructura JSON de cultivos
Muestra la estructura exacta y detecta problemas

USO:
python diagnostico_json.py cultivos_expandido_ia.json
"""

import json
import sys
from pathlib import Path

def analizar_tipo(valor, nivel=0):
    """Analiza recursivamente el tipo de datos"""
    indent = "  " * nivel
    
    if isinstance(valor, dict):
        print(f"{indent}📦 Dict con {len(valor)} keys:")
        for key in list(valor.keys())[:5]:  # Solo primeras 5 keys
            print(f"{indent}  - {key}: {type(valor[key]).__name__}", end="")
            if isinstance(valor[key], (list, dict)):
                print(f" (len: {len(valor[key])})")
            else:
                print()
        if len(valor) > 5:
            print(f"{indent}  ... y {len(valor)-5} más")
    
    elif isinstance(valor, list):
        print(f"{indent}📋 List con {len(valor)} elementos")
        if valor:
            print(f"{indent}  Tipo elementos: {type(valor[0]).__name__}")
            if isinstance(valor[0], dict):
                print(f"{indent}  Keys primer elemento: {list(valor[0].keys())[:5]}")
    
    else:
        print(f"{indent}📄 {type(valor).__name__}: {str(valor)[:50]}")

def diagnosticar_archivo(archivo):
    """Diagnostica estructura completa del archivo"""
    
    print("\n🔍 DIAGNÓSTICO DE ESTRUCTURA JSON")
    print("="*60)
    print(f"📂 Archivo: {archivo}\n")
    
    try:
        with open(archivo, 'r', encoding='utf-8') as f:
            datos = json.load(f)
    except FileNotFoundError:
        print(f"❌ Archivo no encontrado: {archivo}")
        return
    except json.JSONDecodeError as e:
        print(f"❌ Error JSON: {e}")
        return
    
    # Tamaño
    size_mb = Path(archivo).stat().st_size / (1024 * 1024)
    print(f"📦 Tamaño: {size_mb:.2f} MB")
    print(f"📊 Tipo raíz: {type(datos).__name__}\n")
    
    # Estructura raíz
    if isinstance(datos, dict):
        print("🌳 Estructura raíz:")
        for key in datos.keys():
            print(f"  • {key}: {type(datos[key]).__name__}", end="")
            if isinstance(datos[key], (list, dict)):
                print(f" (len: {len(datos[key])})")
            else:
                print()
        print()
    
    # Analizar cultivos
    if "cultivos" in datos:
        cultivos = datos["cultivos"]
        print(f"\n📚 Sección 'cultivos': {type(cultivos).__name__}")
        
        if isinstance(cultivos, dict):
            print(f"   Total cultivos: {len(cultivos)}")
            
            # Analizar primeros 3 cultivos en detalle
            print("\n🔬 Análisis detallado primeros 3 cultivos:\n")
            
            for i, (nombre, cultivo_data) in enumerate(list(cultivos.items())[:3], 1):
                print(f"\n{'='*60}")
                print(f"[{i}] {nombre}")
                print(f"{'='*60}")
                print(f"Tipo: {type(cultivo_data).__name__}")
                
                if isinstance(cultivo_data, dict):
                    print(f"Keys ({len(cultivo_data)}):")
                    for key in cultivo_data.keys():
                        valor = cultivo_data[key]
                        tipo = type(valor).__name__
                        extra = ""
                        
                        if isinstance(valor, (list, dict)):
                            extra = f" (len: {len(valor)})"
                            
                            # Detectar listas donde se esperan dicts
                            if isinstance(valor, list) and valor:
                                primer_elem = valor[0]
                                extra += f" [elementos: {type(primer_elem).__name__}]"
                        
                        print(f"  • {key}: {tipo}{extra}")
                
                elif isinstance(cultivo_data, list):
                    print(f"⚠️  PROBLEMA: Cultivo es una lista con {len(cultivo_data)} elementos")
                    if cultivo_data:
                        print(f"   Tipo elementos: {type(cultivo_data[0]).__name__}")
                        if isinstance(cultivo_data[0], dict):
                            print(f"   Keys primer elemento: {list(cultivo_data[0].keys())[:5]}")
                
                else:
                    print(f"⚠️  PROBLEMA: Cultivo es {type(cultivo_data).__name__}")
                    print(f"   Valor: {str(cultivo_data)[:100]}")
        
        elif isinstance(cultivos, list):
            print(f"⚠️  PROBLEMA: 'cultivos' es una lista, no un dict")
            print(f"   Elementos: {len(cultivos)}")
            if cultivos:
                print(f"   Tipo elementos: {type(cultivos[0]).__name__}")
    
    # Buscar problemas comunes
    print("\n\n🔍 DETECCIÓN DE PROBLEMAS:")
    print("="*60)
    
    problemas = []
    
    # Problema 1: cultivos no es dict
    if "cultivos" in datos and not isinstance(datos["cultivos"], dict):
        problemas.append({
            "tipo": "Estructura incorrecta",
            "ubicacion": "cultivos",
            "problema": f"Debe ser dict, es {type(datos['cultivos']).__name__}",
            "solucion": "Convertir lista a dict con nombre como key"
        })
    
    # Problema 2: cultivos individuales no son dict
    if "cultivos" in datos and isinstance(datos["cultivos"], dict):
        for nombre, cultivo_data in list(datos["cultivos"].items())[:10]:
            if not isinstance(cultivo_data, dict):
                problemas.append({
                    "tipo": "Cultivo malformado",
                    "ubicacion": f"cultivos['{nombre}']",
                    "problema": f"Es {type(cultivo_data).__name__}, debe ser dict",
                    "solucion": "Revisar generación de datos"
                })
    
    if problemas:
        for i, p in enumerate(problemas, 1):
            print(f"\n❌ Problema {i}:")
            print(f"   Tipo: {p['tipo']}")
            print(f"   Ubicación: {p['ubicacion']}")
            print(f"   Problema: {p['problema']}")
            print(f"   Solución: {p['solucion']}")
    else:
        print("✅ No se detectaron problemas estructurales")
    
    # Recomendaciones
    print("\n\n💡 RECOMENDACIONES:")
    print("="*60)
    
    if problemas:
        print("1. Revisar el archivo JSON manualmente")
        print("2. Verificar que todos los cultivos sean objetos ({})")
        print("3. Usar script de reparación si está disponible")
    else:
        print("✅ Estructura correcta para el completador")
        print("   Puedes ejecutar: python completar_cultivos.py", archivo)

def main():
    if len(sys.argv) < 2:
        print("\nUSO:")
        print("  python diagnostico_json.py archivo.json")
        print("\nEJEMPLO:")
        print("  python diagnostico_json.py cultivos_expandido_ia.json")
        return
    
    archivo = sys.argv[1]
    diagnosticar_archivo(archivo)
    
    print("\n" + "="*60)
    print("Diagnóstico completado")
    print("="*60 + "\n")

if __name__ == "__main__":
    main()