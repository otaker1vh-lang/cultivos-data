import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, FlatList, Image, StyleSheet, TouchableOpacity, 
  Linking, RefreshControl, Share, StatusBar, Dimensions, LayoutAnimation, Platform, UIManager
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';

// Habilitar animaciones en Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get('window');

// --- CONFIGURACIÓN DE FUENTES ---
const CATEGORIAS = {
  TODO: 'Todo',
  MEXICO: 'Nacional 🇲🇽',
  LATAM: 'Internacional 🌎',
  TECH: 'Ciencia 🔬'
};

const FUENTES = [
  // MÉXICO
  { nombre: "InfoRural MX",       color: "#2E7D32", url: "https://inforural.com.mx/feed/", cat: CATEGORIAS.MEXICO },
  { nombre: "Imagen Agro",        color: "#C0392B", url: "https://imagenagropecuaria.com/feed/", cat: CATEGORIAS.MEXICO },
  { nombre: "Tierra Fértil",      color: "#D35400", url: "https://tierrafertil.com.mx/feed/", cat: CATEGORIAS.MEXICO },
  { nombre: "2000Agro",           color: "#154360", url: "https://2000agro.com/feed/", cat: CATEGORIAS.MEXICO },
  // LATAM / GLOBAL
  { nombre: "Portal Frutícola",   color: "#E67E22", url: "https://www.portalfruticola.com/feed/", cat: CATEGORIAS.LATAM },
  { nombre: "Redagrícola",        color: "#E74C3C", url: "https://www.redagricola.com/cl/feed/", cat: CATEGORIAS.LATAM },
  // CIENCIA
  { nombre: "Nature Plants",      color: "#000000", url: "http://www.nature.com/subjects/plant-sciences/rss", cat: CATEGORIAS.TECH },
  { nombre: "Science Daily",      color: "#2980B9", url: "https://www.sciencedaily.com/rss/plants_animals/agriculture_and_food.xml", cat: CATEGORIAS.TECH }
];

const BASE_API = "https://api.rss2json.com/v1/api.json?rss_url=";
const CACHE_KEY = "@noticias_cache_v2";

export default function NoticiasScreen() {
  const [noticias, setNoticias] = useState([]);
  const [noticiasFiltradas, setNoticiasFiltradas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtroActual, setFiltroActual] = useState(CATEGORIAS.TODO);
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);

  // --- 1. CARGA INICIAL (CACHÉ + RED) ---
  useEffect(() => {
    cargarCache(); // 1. Muestra lo guardado inmediatamente
    fetchNoticias(false); // 2. Busca actualizaciones en silencio
  }, []);

  // --- 2. FILTRADO ---
  useEffect(() => {
    if (filtroActual === CATEGORIAS.TODO) {
      setNoticiasFiltradas(noticias);
    } else {
      setNoticiasFiltradas(noticias.filter(n => n.categoria === filtroActual));
    }
  }, [filtroActual, noticias]);

  // --- LÓGICA DE CACHÉ ---
  const cargarCache = async () => {
    try {
      const jsonValue = await AsyncStorage.getItem(CACHE_KEY);
      if (jsonValue != null) {
        const data = JSON.parse(jsonValue);
        setNoticias(data.items);
        setUltimaActualizacion(data.date);
        setCargando(false); // Si hay caché, ya no mostramos loading
      }
    } catch(e) { console.log("Error caché", e); }
  };

  const guardarCache = async (nuevasNoticias) => {
    try {
      const now = new Date().toISOString();
      const data = { items: nuevasNoticias, date: now };
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
      setUltimaActualizacion(now);
    } catch (e) { console.log("Error guardando caché", e); }
  };

  // --- LÓGICA DE RED ---
  const fetchNoticias = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    
    try {
      // Promesas con Timeout para que no se quede pegado si una falla
      const promesas = FUENTES.map(async (fuente) => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 seg max por fuente

          const response = await fetch(BASE_API + encodeURIComponent(fuente.url), { signal: controller.signal });
          clearTimeout(timeoutId);
          
          const json = await response.json();
          if (json.status === 'ok') {
            return json.items.map(item => ({ 
              ...item, 
              fuenteNombre: fuente.nombre, 
              fuenteColor: fuente.color,
              categoria: fuente.cat,
              id: item.guid || item.link, // ID único
              fechaOrden: new Date(item.pubDate) 
            }));
          }
        } catch (e) { return []; } // Si falla una, retorna vacío
        return [];
      });

      const resultados = await Promise.all(promesas);
      const noticiasUnidas = resultados.flat().sort((a, b) => b.fechaOrden - a.fechaOrden);

      // Eliminar duplicados (por si acaso)
      const uniqueNews = Array.from(new Map(noticiasUnidas.map(item => [item.title, item])).values());

      if (uniqueNews.length > 0) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setNoticias(uniqueNews);
        guardarCache(uniqueNews);
      }

    } catch (error) {
      console.error("Error global noticias", error);
    } finally {
      setCargando(false);
      setRefreshing(false);
    }
  };

  const onShare = async (item) => {
    try {
      await Share.share({
        message: `${item.title}\n\nLeído en RoslinApp:\n${item.link}`,
      });
    } catch (error) { console.log(error); }
  };

  const formatearFecha = (fecha) => {
    const d = new Date(fecha);
    const ahora = new Date();
    const dif = Math.floor((ahora - d) / (1000 * 60 * 60)); // Diferencia en horas
    
    if (dif < 1) return "Hace un momento";
    if (dif < 24) return `Hace ${dif} horas`;
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  // --- RENDERIZADO: SKELETON (CARGA) ---
  const RenderSkeleton = () => (
    <View style={styles.skeletonContainer}>
       {[1, 2, 3].map(i => (
         <View key={i} style={styles.skeletonCard}>
            <View style={styles.skeletonImage} />
            <View style={styles.skeletonTextBar} />
            <View style={[styles.skeletonTextBar, {width: '60%'}]} />
         </View>
       ))}
    </View>
  );

  // --- RENDERIZADO: ITEM NORMAL ---
  const renderItem = ({ item, index }) => {
    // La primera noticia es la destacada (si estamos en filtro 'Todo' o el índice es 0)
    const isFeatured = index === 0;

    if (isFeatured) {
        return (
            <TouchableOpacity style={styles.featuredCard} onPress={() => Linking.openURL(item.link)}>
                <Image source={{ uri: item.thumbnail || 'https://via.placeholder.com/400x200?text=AgroNoticias' }} style={styles.featuredImage} />
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.featuredOverlay}>
                    <View style={[styles.categoryTag, { backgroundColor: item.fuenteColor }]}>
                        <Text style={styles.categoryText}>{item.fuenteNombre}</Text>
                    </View>
                    <Text style={styles.featuredTitle} numberOfLines={3}>{item.title}</Text>
                    <Text style={styles.featuredDate}>{formatearFecha(item.pubDate)} • {item.categoria}</Text>
                </LinearGradient>
            </TouchableOpacity>
        );
    }

    return (
        <TouchableOpacity style={styles.rowCard} onPress={() => Linking.openURL(item.link)}>
            <View style={styles.rowContent}>
                <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 4}}>
                    <View style={[styles.miniDot, {backgroundColor: item.fuenteColor}]} />
                    <Text style={styles.rowSource}>{item.fuenteNombre}</Text>
                    <Text style={styles.rowDate}> • {formatearFecha(item.pubDate)}</Text>
                </View>
                <Text style={styles.rowTitle} numberOfLines={3}>{item.title}</Text>
                
                <View style={styles.rowActions}>
                    <TouchableOpacity onPress={() => onShare(item)} style={{flexDirection:'row', alignItems:'center'}}>
                        <MaterialCommunityIcons name="share-variant-outline" size={16} color="#7f8c8d" />
                        <Text style={styles.actionText}>Compartir</Text>
                    </TouchableOpacity>
                </View>
            </View>
            
            {item.thumbnail ? (
                <Image source={{ uri: item.thumbnail }} style={styles.rowImage} />
            ) : (
                <View style={[styles.rowImage, styles.placeholderImg]}>
                     <MaterialCommunityIcons name="newspaper" size={24} color="#bdc3c7" />
                </View>
            )}
        </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />
      
      {/* HEADER MODERNO */}
      <View style={styles.header}>
         <Text style={styles.headerTitle}>AgroNoticias</Text>
         <Text style={styles.headerSubtitle}>Actualidad Global</Text>
      </View>

      {/* CHIPS DE CATEGORÍAS */}
      <View style={styles.chipsContainer}>
        <FlatList 
            horizontal
            showsHorizontalScrollIndicator={false}
            data={Object.values(CATEGORIAS)}
            keyExtractor={item => item}
            contentContainerStyle={{paddingHorizontal: 15}}
            renderItem={({item}) => (
                <TouchableOpacity 
                    style={[styles.chip, filtroActual === item && styles.chipActive]}
                    onPress={() => setFiltroActual(item)}
                >
                    <Text style={[styles.chipText, filtroActual === item && styles.chipTextActive]}>{item}</Text>
                </TouchableOpacity>
            )}
        />
      </View>

      {/* LISTA DE NOTICIAS */}
      {cargando && noticias.length === 0 ? (
        <RenderSkeleton />
      ) : (
        <FlatList
          data={noticiasFiltradas}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 20 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchNoticias(true)} colors={['#2E7D32']} />
          }
          ListFooterComponent={
            ultimaActualizacion && (
              <Text style={styles.footerText}>
                Actualizado: {new Date(ultimaActualizacion).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </Text>
            )
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
                <MaterialCommunityIcons name="newspaper-remove" size={50} color="#ccc" />
                <Text style={{color: '#999', marginTop: 10}}>No hay noticias en esta categoría.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F4F6' },
  
  // Header
  header: { 
    backgroundColor: '#1B5E20', 
    paddingTop: 50, 
    paddingBottom: 20, 
    paddingHorizontal: 20,
    borderBottomRightRadius: 30,
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  headerSubtitle: { fontSize: 14, color: '#A5D6A7', fontWeight: '600' },

  // Chips
  chipsContainer: { marginVertical: 15, height: 40 },
  chip: { 
    paddingHorizontal: 16, 
    paddingVertical: 8, 
    backgroundColor: '#fff', 
    borderRadius: 20, 
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    elevation: 2
  },
  chipActive: { backgroundColor: '#2E7D32', borderColor: '#2E7D32' },
  chipText: { color: '#555', fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#fff' },

  // Destacada (Featured)
  featuredCard: {
    marginHorizontal: 15,
    marginBottom: 20,
    height: 250,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#000',
    elevation: 5
  },
  featuredImage: { width: '100%', height: '100%', opacity: 0.8 },
  featuredOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: '60%',
    justifyContent: 'flex-end',
    padding: 15
  },
  categoryTag: { 
    alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, 
    borderRadius: 6, marginBottom: 8 
  },
  categoryText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  featuredTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', lineHeight: 26, marginBottom: 5 },
  featuredDate: { color: '#ddd', fontSize: 12 },

  // Lista Normal (Row)
  rowCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 15,
    marginBottom: 12,
    borderRadius: 12,
    padding: 12,
    elevation: 2,
    shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: {width:0, height:2}
  },
  rowContent: { flex: 1, marginRight: 10, justifyContent: 'space-between' },
  rowSource: { fontSize: 11, fontWeight: '700', color: '#555' },
  rowDate: { fontSize: 11, color: '#999' },
  miniDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#2c3e50', lineHeight: 20, marginVertical: 5 },
  rowImage: { width: 90, height: 90, borderRadius: 8, backgroundColor: '#f0f0f0' },
  placeholderImg: { justifyContent: 'center', alignItems: 'center' },
  
  rowActions: { flexDirection: 'row', marginTop: 5 },
  actionText: { fontSize: 11, color: '#7f8c8d', marginLeft: 4 },

  // Footer & Empty
  footerText: { textAlign: 'center', color: '#aaa', fontSize: 11, marginBottom: 20, fontStyle: 'italic' },
  emptyState: { alignItems: 'center', marginTop: 50 },

  // Skeleton
  skeletonContainer: { paddingHorizontal: 15 },
  skeletonCard: {
    backgroundColor: '#fff',
    height: 100,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10
  },
  skeletonImage: { width: 80, height: 80, backgroundColor: '#eee', borderRadius: 8 },
  skeletonTextBar: { height: 10, backgroundColor: '#eee', marginTop: 10, borderRadius: 5, flex: 1, marginLeft: 10 }
});