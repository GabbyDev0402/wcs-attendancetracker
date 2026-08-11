import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ReactDOM from 'react-dom'
import './index.css'
import App from './App.jsx'

// React 19 Polyfill for react-quill (findDOMNode was removed in React 19)
if (typeof window !== 'undefined' && !ReactDOM.findDOMNode) {
  ReactDOM.findDOMNode = (componentOrElement) => {
    if (!componentOrElement) return null;
    if (componentOrElement instanceof HTMLElement) return componentOrElement;
    if (componentOrElement.current instanceof HTMLElement) return componentOrElement.current;
    return null;
  };
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
