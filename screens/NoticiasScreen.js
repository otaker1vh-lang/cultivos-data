import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  Image, 
  StyleSheet, 
  TouchableOpacity, 
  Linking, 
  ActivityIndicator, 
  RefreshControl 
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// --- CONFIGURACIÓN DE FUENTES ---
const FUENTES = [
  // 1. FUENTES MEXICANAS (Prioridad Local 🇲🇽)
  { nombre: "InfoRural MX",       color: "#2E7D32", url: "https://inforural.com.mx/feed/" },
  { nombre: "Imagen Agropecuaria",color: "#C0392B", url: "https://imagenagropecuaria.com/feed/" },
  { nombre: "Tierra Fértil",      color: "#D35400", url: "https://tierrafertil.com.mx/feed/" },
  { nombre: "2000Agro MX",        color: "#154360", url: "https://2000agro.com/feed/" },
  { nombre: "Ganadería.com",      color: "#8E44AD", url: "https://www.ganaderia.com/feed" },

  // 2. FUENTES LATAM Y ESPAÑA (Mercado en español)
  { nombre: "Portal Frutícola",   color: "#E67E22", url: "https://www.portalfruticola.com/feed/" },
  { nombre: "InfoAgro Global",    color: "#27AE60", url: "https://www.infoagro.com/noticias/rss.asp" },
  { nombre: "Redagrícola",        color: "#E74C3C", url: "https://www.redagricola.com/cl/feed/" },

  // 3. CIENCIA Y TECNOLOGÍA (Inglés - Alto Nivel)
  { nombre: "(EN) Nature Plants", color: "#000000", url: "http://www.nature.com/subjects/plant-sciences/rss" },
  { nombre: "(EN) Science Daily", color: "#2980B9", url: "https://www.sciencedaily.com/rss/plants_animals/agriculture_and_food.xml" }
];

const BASE_API = "https://api.rss2json.com/v1/api.json?rss_url=";

export default function NoticiasScreen() {
  const [noticias, setNoticias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const obtenerNoticias = async () => {
    try {
      const promesas = FUENTES.map(async (fuente) => {
        try {
          const response = await fetch(BASE_API + encodeURIComponent(fuente.url));
          const json = await response.json();
          if (json.status === 'ok') {
            return json.items.map(item => ({ 
              ...item, 
              fuenteNombre: fuente.nombre, 
              fuenteColor: fuente.color,
              // Convertimos fecha para ordenar
              fechaOrden: new Date(item.pubDate) 
            }));
          }
        } catch (e) { 
            // Si falla una fuente, la ignoramos silenciosamente y seguimos con las demás
            return []; 
        }
        return [];
      });

      // Esperamos a que TODAS las fuentes respondan
      const resultados = await Promise.all(promesas);
      
      // Unimos todo en una sola lista gigante
      const noticiasUnidas = resultados.flat();

      // ORDENAMIENTO: Lo más reciente primero
      noticiasUnidas.sort((a, b) => b.fechaOrden - a.fechaOrden);

      setNoticias(noticiasUnidas);

    } catch (error) { 
      console.error("Error general:", error); 
    } finally { 
      setCargando(false); 
      setRefreshing(false); 
    }
  };

  useEffect(() => { obtenerNoticias(); }, []);
  
  const onRefresh = () => { setRefreshing(true); obtenerNoticias(); };
  
  const abrirNoticia = (url) => { if (url) Linking.openURL(url); };

  const formatearFecha = (fechaString) => { 
    const f = new Date(fechaString); 
    // Formato corto para ahorrar espacio: "13/12 10:30"
    return `${f.getDate()}/${f.getMonth()+1} ${f.getHours()}:${f.getMinutes() < 10 ? '0' : ''}${f.getMinutes()}`; 
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.card} onPress={() => abrirNoticia(item.link)}>
      <View style={styles.imageContainer}>
        {item.thumbnail ? (
            <Image source={{ uri: item.thumbnail }} style={styles.cardImage} resizeMode="cover" />
        ) : (
            <View style={[styles.cardImage, styles.placeholderImage]}>
                <MaterialCommunityIcons name="newspaper-variant-outline" size={40} color="#8C6239" />
            </View>
        )}
        {/* Badge de la fuente */}
        <View style={[styles.sourceBadge, { backgroundColor: item.fuenteColor || '#444' }]}>
            <Text style={styles.sourceText}>{item.fuenteNombre}</Text>
        </View>
      </View>
      
      <View style={styles.cardContent}>
        <View style={styles.metaRow}>
            <View style={{flexDirection:'row', alignItems:'center'}}>
                <MaterialCommunityIcons name="clock-outline" size={12} color="#7f8c8d" /> 
                <Text style={styles.date}> {formatearFecha(item.pubDate)}</Text>
            </View>
        </View>
        
        <Text style={styles.title} numberOfLines={3}>{item.title}</Text>
        
        {/* Descripción limpia */}
        <Text style={styles.description} numberOfLines={3}>
            {item.description ? item.description.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() : ""}
        </Text>
        
        <View style={styles.readMore}>
            <Text style={[styles.readMoreText, { color: item.fuenteColor }]}>Leer nota</Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color={item.fuenteColor} />
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header Sólido (Sin bug de gradiente) */}
      <View style={styles.header}>
        <View style={{flexDirection: 'row', alignItems:'center'}}>
            <MaterialCommunityIcons name="earth" size={28} color="#fff" style={{marginRight: 10}} />
            <Text style={styles.headerTitle}>AgroNoticias Global</Text>
        </View>
        <Text style={styles.headerSub}>México, Latam y Ciencia</Text>
      </View>

      {cargando ? (
        <View style={styles.loader}>
            <ActivityIndicator size="large" color="#2E7D32" />
            <Text style={{marginTop: 10, color:'#555'}}>Recopilando noticias...</Text>
        </View>
      ) : (
        <FlatList 
            data={noticias} 
            keyExtractor={(item, index) => index.toString()} 
            renderItem={renderItem} 
            contentContainerStyle={styles.listContent} 
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2E7D32']} />
            }
            ListEmptyComponent={
                <View style={{alignItems:'center', marginTop: 50}}>
                    <MaterialCommunityIcons name="wifi-off" size={40} color="#ccc" />
                    <Text style={{color:'#999', marginTop:10}}>Verifica tu conexión.</Text>
                </View>
            }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FDFBF7' },
  header: { 
    paddingTop: 50, 
    paddingBottom: 20, 
    paddingHorizontal: 20, 
    backgroundColor: '#1B5E20', // Verde Oscuro
    borderBottomLeftRadius: 25, 
    borderBottomRightRadius: 25, 
    elevation: 6
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  headerSub: { fontSize: 14, color: '#A5D6A7', marginTop: 5 },
  
  listContent: { padding: 15 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  card: { 
    backgroundColor: '#fff', 
    borderRadius: 16, 
    marginBottom: 20, 
    elevation: 3,
    shadowColor: '#000', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 2 },
    overflow: 'hidden' 
  },
  imageContainer: { position: 'relative', height: 150, backgroundColor: '#f0f0f0' },
  cardImage: { width: '100%', height: '100%' },
  placeholderImage: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#EAECEE' },
  
  sourceBadge: { 
    position: 'absolute', top: 10, right: 10, 
    paddingHorizontal: 8, paddingVertical: 4, 
    borderRadius: 12, elevation: 2
  },
  sourceText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  
  cardContent: { padding: 15 },
  metaRow: { flexDirection: 'row', justifyContent:'space-between', marginBottom: 6 },
  date: { fontSize: 11, color: '#95a5a6' },
  
  title: { fontSize: 16, fontWeight: 'bold', color: '#2C3E50', marginBottom: 6, lineHeight: 22 },
  description: { fontSize: 13, color: '#555', marginBottom: 10, lineHeight: 18 },
  
  readMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f9f9f9' },
  readMoreText: { fontWeight: '700', fontSize: 12, marginRight: 2 },
});