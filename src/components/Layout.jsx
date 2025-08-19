import React from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../firebase';
import Header from './Header';
import Dashboard from './Dashboard';

const Layout = () => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-lime-400"></div>
      </div>
    );
  }

  // If user is not logged in and trying to access protected routes
  if (!user && location.pathname !== '/auth') {
    return <Navigate to="/auth" />;
  }

  // If user is logged in and on /auth, redirect to dashboard
  if (user && location.pathname === '/auth') {
    return <Navigate to="/dashboard" />;
  }

  // Auth page (login/signup)
  if (location.pathname === '/auth') {
    return (
      <div className="min-h-screen bg-neutral-950">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Welcome to LungoAI</h1>
            <p className="text-neutral-400">Sign in to your account</p>
          </div>
          {/* You can add SignUp component here if needed */}
          <div className="max-w-md mx-auto">
            <div className="text-center text-white">
              Please sign in to continue
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Protected routes with header
  return (
    <div className="min-h-screen bg-neutral-950">
      <Header />
      <main>
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;