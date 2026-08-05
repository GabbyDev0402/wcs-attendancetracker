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
import WeeklyLessonReport from './pages/WeeklyLessonReport';
import StudentDashboard from './pages/StudentDashboard';
import StudentClassDashboard from './pages/StudentClassDashboard';
import StudentVocabHistory from './pages/StudentVocabHistory';
import StudentExamSession from './pages/StudentExamSession';
import ClassDashboard from './pages/ClassDashboard';

const getRoleDefaultRoute = (role) => {
  if (role === 'admin') return '/admin';
  if (role === 'teacher') return '/teacher';
  if (role === 'student') return '/student';
  return '/login';
};

// Route guard with optional role authorization
function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // If not authorized for this specific role, redirect to appropriate role dashboard
    return <Navigate to={getRoleDefaultRoute(user.role)} replace />;
  }
  
  return children;
}

// Redirect logged-in users away from the login page
function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  if (user) {
    return <Navigate to={getRoleDefaultRoute(user.role)} replace />;
  }
  
  return children;
}

// Wildcard fallback redirect component
function WildcardRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={getRoleDefaultRoute(user.role)} replace />;
}

export default function App() {
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

          {/* Protected Student Routes */}
          <Route 
            path="/student" 
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<StudentDashboard />} />
            <Route path="class/:classId" element={<StudentClassDashboard />} />
            <Route path="class/:classId/history" element={<StudentVocabHistory />} />
            <Route path="class/:classId/exam/:examId" element={<StudentExamSession />} />
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

            {/* Google Classroom Portal dynamic route */}
            <Route path="class/:classId" element={<ClassDashboard />} />
            
            {/* Log attendance roster */}
            <Route path="log" element={<AttendanceLog />} />
            
            {/* Weekly lesson reports (Primary & Aliases) */}
            <Route path="lesson-reports" element={<WeeklyLessonReport />} />
            <Route path="lessons" element={<WeeklyLessonReport />} />
            <Route path="lesson-report" element={<WeeklyLessonReport />} />
            
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
