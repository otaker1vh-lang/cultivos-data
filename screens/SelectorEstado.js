import React from 'react';
import { View, Text, Picker, StyleSheet } from 'react-native';


export default function SelectorEstado({ estados, valor, onChange }) {
return (
<View style={styles.container}>
<Text>Selecciona estado:</Text>
<Picker selectedValue={valor} onValueChange={onChange}>
{estados.map(e => <Picker.Item key={e} label={e} value={e} />)}
</Picker>
</View>
);
}


const styles = StyleSheet.create({ container:{ marginVertical:8 } });