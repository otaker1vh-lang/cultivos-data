import json
import os
import shutil
import unicodedata
import re
from icrawler.builtin import BingImageCrawler

# --- CONFIGURACIÓN ---
JSON_FILE = 'data/cultivos.json' # Asegúrate que la ruta coincida con tu proyecto
OUTPUT_DIR = 'assets/plagas'
JS_MAP_FILE = 'data/images.js'

# --- DICCIONARIO DE PRECISIÓN ---
# Mapea el nombre común de tu JSON al nombre científico exacto
# Si agregas más plagas al JSON, agrégalas aquí para mejorar la puntería.
SCIENTIFIC_MAP = {
    # MAÍZ
    "Gusano Cogollero": "Spodoptera frugiperda larva corn",
    "Gusano Elotero": "Helicoverpa zea corn",
    "Araña Roja": "Tetranychus urticae mite leaf",
    "Diabrótica": "Diabrotica virgifera corn rootworm",
    "Pulgón del Maíz": "Rhopalosiphum maidis",
    "Carbón de la espiga": "Sporisorium reilianum corn",
    "Tizón foliar": "Exserohilum turcicum corn leaf blight",
    "Pudrición de Tallo": "Fusarium graminearum corn stalk rot",
    "Achaparramiento": "Spiroplasma kunkelii corn stunt",
    "Roya Común": "Puccinia sorghi corn rust",
    
    # JITOMATE
    "Mosca Blanca": "Bemisia tabaci tomato leaf",
    "Minador de la Hoja": "Liriomyza trifolii tomato leaf miner",
    "Paratrioza": "Bactericera cockerelli tomato",
    "Tizón Tardío": "Phytophthora infestans tomato late blight",
    "Fusarium": "Fusarium oxysporum tomato wilt",
    
    # AGUACATE
    "Barrenador del hueso": "Heilipus lauri avocado seed",
    "Trips": "Frankliniella avocado fruit damage",
    "Escama de San José": "Quadraspidiotus perniciosus",
    "Barrenador de ramas": "Copturus aguacatae",
    "Tristeza": "Phytophthora cinnamomi avocado root rot",
    "Antracnosis": "Colletotrichum gloeosporioides avocado fruit",
    "Roña": "Sphaceloma perseae avocado scab",
    
    # CHILES
    "Picudo del Chile": "Anthonomus eugenii pepper weevil",
    "Secadera": "Phytophthora capsici pepper wilt",
    "Mancha Bacteriana": "Xanthomonas campestris pepper leaf spot",
    
    # CÍTRICOS (Limón/Naranja)
    "HLB": "Huanglongbing citrus greening symptom leaf",
    "Dragón Amarillo": "Huanglongbing citrus greening",
    "Psílido Asiático": "Diaphorina citri citrus",
    "Gomosis": "Phytophthora parasitica citrus gummosis",
    "Pulgón": "Toxoptera citricida",
    
    # CAFÉ
    "Broca del Café": "Hypothenemus hampei coffee berry borer",
    "Roya del Café": "Hemileia vastatrix coffee leaf rust",
    "Ojo de Gallo": "Mycena citricolor coffee leaf",
    
    # AGAVE
    "Picudo del Agave": "Scyphophorus acupunctatus agave weevil",
    "Mancha gris": "Cercospora agavicola agave",
    "Pudrición blanda": "Erwinia carotovora agave rot",
    
    # GENÉRICOS / OTROS
    "Cenicilla": "Powdery mildew plant leaf symptoms",
    "Botrytis": "Botrytis cinerea gray mold plant",
    "Minador": "Leaf miner damage leaf gallery",
    "Roya": "Rust fungus plant leaf symptoms"
}

def clean_filename(text):
    text = text.lower()
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('utf-8')
    text = re.sub(r'[^a-z0-9]+', '_', text)
    return text.strip('_')

def main():
    print("--- INICIANDO DESCARGA DE PRECISIÓN AGRÍCOLA ---")
    
    if not os.path.exists(JSON_FILE):
        print(f"❌ Error: No encuentro {JSON_FILE}. Verifica la ruta.")
        return

    with open(JSON_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)

    js_lines = []
    
    # Acceder a la estructura correcta: data['cultivos']
    cultivos = data.get('cultivos', {})

    for nombre_cultivo, datos_cultivo in cultivos.items():
        print(f"\n🌾 Cultivo: {nombre_cultivo}")
        
        cultivo_clean = clean_filename(nombre_cultivo)
        cultivo_path = os.path.join(OUTPUT_DIR, cultivo_clean)
        
        if not os.path.exists(cultivo_path):
            os.makedirs(cultivo_path)

        lista_plagas = datos_cultivo.get('plagas_y_enfermedades', [])
        
        for item in lista_plagas:
            nombre_comun = item['nombre']
            plaga_clean = clean_filename(nombre_comun)
            filename = f"{plaga_clean}.jpg"
            final_path = os.path.join(cultivo_path, filename)

            if os.path.exists(final_path):
                print(f"   ⏩ Saltando (ya existe): {nombre_comun}")
            else:
                # --- CONSTRUCCIÓN DE LA QUERY CIENTÍFICA ---
                # 1. Buscamos el nombre científico en el mapa
                # 2. Si no está, usamos: Nombre Común + Cultivo + "sintomas daño campo"
                
                search_term = SCIENTIFIC_MAP.get(nombre_comun)
                
                if search_term:
                    # Si tenemos el científico, lo usamos directo + keywords de realismo
                    query = f"{search_term} close up symptoms field"
                    print(f"   🔍 Buscando (Científico): '{query}'")
                else:
                    # Fallback robusto
                    query = f"{nombre_comun} {nombre_cultivo} sintomas daño hoja campo agriculture"
                    print(f"   🔎 Buscando (Genérico): '{query}'")

                # Usar carpeta temporal para descarga
                temp_dir = os.path.join(cultivo_path, 'temp_dl')
                
                try:
                    crawler = BingImageCrawler(storage={'root_dir': temp_dir}, log_level='ERROR')
                    # Descargamos 1 imagen. filters='photo' evita dibujos.
                    crawler.crawl(keyword=query, max_num=1, filters=dict(type='photo'))

                    # Mover y renombrar
                    downloaded = os.listdir(temp_dir)
                    if downloaded:
                        src = os.path.join(temp_dir, downloaded[0])
                        shutil.move(src, final_path)
                        print(f"   ✅ Descargado: {filename}")
                    else:
                        print(f"   ⚠️ No se encontraron imágenes para: {nombre_comun}")
                
                except Exception as e:
                    print(f"   ❌ Error descargando {nombre_comun}: {e}")
                
                finally:
                    if os.path.exists(temp_dir):
                        shutil.rmtree(temp_dir)

            # Agregar al mapa JS
            # key format: 'maiz_gusano_cogollero'
            key = f"{cultivo_clean}_{plaga_clean}"
            # Ajustamos la ruta para que funcione dentro de 'data/images.js' apuntando hacia atrás '../assets'
            relative_path = f"../assets/plagas/{cultivo_clean}/{filename}"
            js_lines.append(f"  '{key}': require('{relative_path}'),")

    # Generar images.js
    js_content = "const images = {\n" + "\n".join(js_lines) + "\n};\n\nexport default images;"
    
    with open(JS_MAP_FILE, 'w', encoding='utf-8') as f:
        f.write(js_content)
        
    print(f"\n✨ ¡Listo! Se generó {JS_MAP_FILE}")
    print("Recuerda limpiar caché: npx expo start --clear")

if __name__ == '__main__':
    main()