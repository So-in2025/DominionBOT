
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './src/App';

// Importación de CSS global solo si el archivo existe físicamente
// Como estamos usando Tailwind vía CDN en el HTML, no es estrictamente necesario aquí
// pero lo mantenemos comentado para futura referencia de estilos personalizados.
// import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);