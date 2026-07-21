import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import TeacherDashboard from './pages/TeacherDashboard';
import AttendanceLog from './pages/AttendanceLog';
import MonthlyReports from './pages/MonthlyReports';
import AdminDashboard from './pages/AdminDashboard';
import TeacherRoster from './pages/TeacherRoster';

// Route guard with optional role authorization
function ProtectedRoute({ children, allowedRoles }) {
  const { user } = useAuth();
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // If not authorized for this specific role, redirect to appropriate console
    return <Navigate to={user.role === 'admin' ? '/admin' : '/teacher'} replace />;
  }
  
  return children;
}

// Redirect logged-in users away from the login page
function PublicRoute({ children }) {
  const { user } = useAuth();
  
  if (user) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/teacher'} replace />;
  }
  
  return children;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Auth Route */}
          <Route 
            path="/login" 
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            } 
          />

          {/* Protected Admin Routes */}
          <Route 
            path="/admin" 
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
          </Route>

          {/* Protected Teacher Dashboard Routes */}
          <Route 
            path="/teacher" 
            element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <Layout />
              </ProtectedRoute>
            }
          >
            {/* Overview dashboard */}
            <Route index element={<TeacherDashboard />} />
            
            {/* Log attendance roster */}
            <Route path="log" element={<AttendanceLog />} />
            
            {/* Monthly reports */}
            <Route path="reports" element={<MonthlyReports />} />

            {/* Student roster management */}
            <Route path="roster" element={<TeacherRoster />} />
          </Route>

          {/* Wildcard Fallback */}
          <Route 
            path="*" 
            element={
              <useAuth>
                {({ user }) => {
                  if (!user) return <Navigate to="/login" replace />;
                  return <Navigate to={user.role === 'admin' ? '/admin' : '/teacher'} replace />;
                }}
              </useAuth>
            } 
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

// Custom wrapper helper to evaluate fallback navigation dynamically inside route element
function WildcardRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'admin' ? '/admin' : '/teacher'} replace />;
}

// Let's use the helper for the wildcard route
function AppWithWildcard() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Auth Route */}
          <Route 
            path="/login" 
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            } 
          />

          {/* Protected Admin Routes */}
          <Route 
            path="/admin" 
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
          </Route>

          {/* Protected Teacher Dashboard Routes */}
          <Route 
            path="/teacher" 
            element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <Layout />
              </ProtectedRoute>
            }
          >
            {/* Overview dashboard */}
            <Route index element={<TeacherDashboard />} />
            
            {/* Log attendance roster */}
            <Route path="log" element={<AttendanceLog />} />
            
            {/* Monthly reports */}
            <Route path="reports" element={<MonthlyReports />} />

            {/* Student roster management */}
            <Route path="roster" element={<TeacherRoster />} />
          </Route>

          {/* Wildcard Fallback */}
          <Route path="*" element={<WildcardRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default AppWithWildcard;
