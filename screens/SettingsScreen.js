import React, { useState } from "react";
import { View, Text, TextInput, Button, Alert } from "react-native";
import { db } from "../firebaseConfig";
import { collection, addDoc } from "firebase/firestore";

export default function SettingsScreen() {
  const [nombre, setNombre] = useState("");
  const [valor, setValor] = useState("");

  const guardar = async () => {
    if (!nombre || !valor) return Alert.alert("Campos vacíos", "Completa ambos campos");
    await addDoc(collection(db, "estadisticas"), { nombre, valor });
    Alert.alert("Guardado", "Dato agregado correctamente");
    setNombre("");
    setValor("");
  };

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 18, marginBottom: 10 }}>⚙️ Agregar nueva estadística</Text>
      <TextInput
        placeholder="Nombre"
        value={nombre}
        onChangeText={setNombre}
        style={{ borderWidth: 1, marginBottom: 10, padding: 8 }}
      />
      <TextInput
        placeholder="Valor"
        value={valor}
        onChangeText={setValor}
        style={{ borderWidth: 1, marginBottom: 10, padding: 8 }}
      />
      <Button title="Guardar" onPress={guardar} />
    </View>
  );
}
