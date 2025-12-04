import React, { useEffect, useState } from "react";
import { View, Text, FlatList } from "react-native";
import { db } from "../firebaseConfig";
import { collection, getDocs } from "firebase/firestore";

export default function StatsScreen() {
  const [datos, setDatos] = useState([]);

  useEffect(() => {
    const obtenerDatos = async () => {
      const querySnapshot = await getDocs(collection(db, "estadisticas"));
      const items = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDatos(items);
    };
    obtenerDatos();
  }, []);

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 10 }}>
        📈 Estadísticas del cultivo
      </Text>
      <FlatList
        data={datos}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Text>- {item.nombre}: {item.valor}</Text>
        )}
      />
    </View>
  );
}
