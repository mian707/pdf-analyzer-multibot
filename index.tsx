import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Surfaces render-time errors on screen instead of showing a blank page.
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App crashed during render:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ fontFamily: 'Inter, sans-serif', padding: '2rem', maxWidth: 800, margin: '0 auto' }}>
          <h1 style={{ color: '#dc2626', fontSize: 20, fontWeight: 700 }}>Something went wrong</h1>
          <p style={{ color: '#475569', marginTop: 8 }}>
            The app hit a runtime error. The details below are also in your browser console.
          </p>
          <pre style={{ marginTop: 16, padding: 16, background: '#0f172a', color: '#f1f5f9', borderRadius: 12, overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap' }}>
            {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
          </pre>
        </div>
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this as any).props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
