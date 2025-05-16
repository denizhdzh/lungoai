import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import CalendarView from './components/CalendarView';
import Settings from './components/Settings';
import AiGuide from './components/CommandInfo';
import Login from './components/Login';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from './firebase';
import LoadingSpinner from './components/LoadingSpinner';

function App() {
  const [user, loading, error] = useAuthState(auth);

  if (loading) {
    return <div className="flex justify-center items-center min-h-screen"><LoadingSpinner /></div>; 
  }

  if (error) {
    // Handle error state appropriately
    return <div>Error: {error.message}</div>;
  }

  return (
    <Router>
      <Routes>
        {/* Public Route for Login */}
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />

        {/* Protected Routes requiring authentication */}
        <Route path="/" element={user ? <Layout /> : <Navigate to="/login" />}>
          <Route index element={<Dashboard />} />
          <Route path="calendar" element={<CalendarView />} />
          <Route path="settings" element={<Settings />} />
          <Route path="aiguide" element={<AiGuide />} />
        </Route>
        
        {/* Redirect any other path to login if not authenticated, or home if authenticated */}
        <Route path="*" element={<Navigate to={user ? "/" : "/login"} />} /> 
      </Routes>
    </Router>
  );
}

export default App; 