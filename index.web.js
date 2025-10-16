import React from 'react';
import { registerRootComponent } from 'expo';
import App from './App';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary atrapó un error en web:', error, info);
  }
  render() {
    if (this.state?.hasError) {
      return (
        <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
          <h2>Se produjo un error al renderizar la aplicación</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{String(this.state.error)}</pre>
          <p>Revisa la consola del navegador para más detalles.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function Root() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

// Web entry point: do NOT import react-native-gesture-handler here
registerRootComponent(Root);