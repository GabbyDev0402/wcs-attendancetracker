import React from "react";
import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Decorative top background elements */}
      <div className="absolute top-0 left-0 -z-10 h-96 w-full bg-gradient-to-b from-brand-50/30 dark:from-brand-900/10 to-transparent pointer-events-none transition-colors duration-200" />
      
      {/* Navigation */}
      <Navbar />
      
      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* Modern Minimalist Footer */}
      <footer className="border-t border-slate-100 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40 py-6 text-center transition-colors duration-200">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          &copy; {new Date().getFullYear()} Washington School. All rights reserved. Attendance Portal.
        </p>
      </footer>
    </div>
  );
}
