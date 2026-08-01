import React from 'react';
import { render } from '@testing-library/react-native';
// Importamos tu componente para poder probarlo
import AsistenteVoz from './AsistenteVoz';

// 'describe' agrupa todas las pruebas relacionadas con este componente
describe('Componente AsistenteVoz', () => {
  
  // 'it' o 'test' define una prueba individual específica
  it('debe renderizar el mensaje de bienvenida correctamente', () => {
    
    // 1. PREPARACIÓN: Renderizamos el componente en la memoria (no en una pantalla real)
    const { getByText } = render(<AsistenteVoz />);

    // 2. ACCIÓN: Buscamos en esa memoria un texto específico que la app debería mostrar
    // Asumimos que tu componente dice "¿En qué te puedo ayudar?" al iniciar
    const textoBienvenida = getByText('¿En qué te puedo ayudar?');
    
    // 3. AFIRMACIÓN (Assertion): Comprobamos que el resultado es el esperado
    // Si el texto existe, la prueba pasa. Si no, la prueba falla y arroja un error.
    expect(textoBienvenida).toBeTruthy();
  });

});