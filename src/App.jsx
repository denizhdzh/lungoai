import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './firebase';
import { Toaster } from 'react-hot-toast';

// Component imports
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Generation from './pages/Generation';
import GenerationPage from './pages/GenerationPage';
import CampaignCreator from './pages/CampaignCreator';
import CanvasWorkspace from './pages/CanvasWorkspace';
import CreativeStudio from './pages/CreativeStudio';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0f23] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }
  
  return user ? children : <Navigate to="/auth" />;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Toaster 
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#1e293b',
                color: '#fff',
                border: '1px solid #334155'
              }
            }}
          />
          <Routes>
            <Route path="/auth" element={<Layout />} />
            <Route path="/" element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }>
              <Route index element={<Dashboard />} />
              <Route path="generation" element={<Generation />} />
              <Route path="gen" element={<GenerationPage />} />
              <Route path="campaigns" element={<CampaignCreator />} />
              <Route path="studio" element={<CanvasWorkspace />} />
              <Route path="creative" element={<CreativeStudio />} />
            </Route>
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App; 