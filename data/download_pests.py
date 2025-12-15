import json
import os
import shutil
import unicodedata
import re
from icrawler.builtin import BingImageCrawler

# --- CONFIGURACIÓN ---
JSON_FILE = 'cultivos.json'
OUTPUT_DIR = 'assets/plagas' # Carpeta donde se guardarán las fotos
JS_MAP_FILE = 'images.js'    # Archivo para importar en React Native

def clean_filename(text):
    """Convierte texto a nombre de archivo seguro (ej: 'Araña Roja' -> 'arana_roja')"""
    text = text.lower()
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('utf-8')
    text = re.sub(r'[^a-z0-9]+', '_', text)
    return text.strip('_')

def main():
    # 1. Cargar JSON
    if not os.path.exists(JSON_FILE):
        print(f"❌ No se encontró {JSON_FILE}")
        return

    with open(JSON_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Crear carpeta principal
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)

    js_export_lines = []
    
    print("🚀 Iniciando descarga de imágenes...")

    # 2. Iterar sobre Cultivos
    for cultivo, detalles in data['cultivos'].items():
        print(f"\n🌱 Procesando cultivo: {cultivo}")
        
        cultivo_clean = clean_filename(cultivo)
        cultivo_dir = os.path.join(OUTPUT_DIR, cultivo_clean)
        
        # Crear carpeta por cultivo
        if not os.path.exists(cultivo_dir):
            os.makedirs(cultivo_dir)

        plagas = detalles.get('plagas_y_enfermedades', [])
        
        for plaga in plagas:
            nombre_plaga = plaga['nombre']
            plaga_clean = clean_filename(nombre_plaga)
            
            # Nombre final del archivo
            filename = f"{plaga_clean}.jpg"
            filepath = os.path.join(cultivo_dir, filename)

            # Verificar si ya existe para no descargar doble
            if os.path.exists(filepath):
                print(f"   ✅ Ya existe: {nombre_plaga}")
            else:
                print(f"   ⬇️ Descargando: {nombre_plaga} en {cultivo}...")
                
                # Búsqueda específica: "NombrePlaga cultivo sintomas"
                query = f"{nombre_plaga} {cultivo} sintomas planta"
                
                # Usamos BingImageCrawler (es más permisivo que Google)
                # Descargamos en una carpeta temporal y luego renombramos
                temp_dir = os.path.join(cultivo_dir, 'temp')
                crawler = BingImageCrawler(storage={'root_dir': temp_dir})
                
                # Descargamos solo 1 imagen
                crawler.crawl(keyword=query, max_num=1, filters=None, file_idx_offset=0)

                # Mover y renombrar la imagen descargada
                try:
                    downloaded_file = os.path.join(temp_dir, '000001.jpg')
                    if os.path.exists(downloaded_file):
                        shutil.move(downloaded_file, filepath)
                        # Eliminar carpeta temporal
                        shutil.rmtree(temp_dir)
                    else:
                        print(f"   ⚠️ No se encontró imagen para {nombre_plaga}")
                except Exception as e:
                    print(f"   ❌ Error moviendo archivo: {e}")

            # Agregar línea para el archivo de mapeo JS
            # Estructura: 'arana_roja': require('./assets/plagas/maiz/arana_roja.jpg'),
            js_line = f"    '{cultivo}_{plaga_clean}': require('./{OUTPUT_DIR}/{cultivo_clean}/{filename}'),"
            js_export_lines.append(js_line)

    # 3. Generar archivo images.js para React Native
    print(f"\n📝 Generando {JS_MAP_FILE}...")
    
    js_content = "const images = {\n"
    js_content += "\n".join(js_export_lines)
    js_content += "\n};\n\nexport default images;"
    
    with open(JS_MAP_FILE, 'w', encoding='utf-8') as f:
        f.write(js_content)

    print("✅ ¡Proceso terminado! Copia la carpeta 'assets' y 'images.js' a tu proyecto.")

if __name__ == '__main__':
    main()