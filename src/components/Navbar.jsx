import React, { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Menu, X, CalendarCheck, BarChart3, ClipboardCheck, LogOut, Shield, Users } from "lucide-react";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
    setIsOpen(false);
  };

  const navItems = user?.role === "teacher" 
    ? [
        { name: "Dashboard", path: "/teacher", icon: CalendarCheck },
        { name: "Take Attendance", path: "/teacher/log", icon: ClipboardCheck },
        { name: "Monthly Reports", path: "/teacher/reports", icon: BarChart3 },
        { name: "Student Roster", path: "/teacher/roster", icon: Users }
      ]
    : user?.role === "admin"
    ? [
        { name: "Admin Console", path: "/admin", icon: Shield }
      ]
    : [];

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-slate-100 bg-white/80 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between items-center">
          {/* Logo and Brand */}
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-2.5 group text-left">
              <img 
                src="/logo.png" 
                alt="Washington School Logo" 
                className="h-9 w-9 object-contain rounded-lg border border-slate-100 transition-all group-hover:scale-105"
              />
              <span className="font-heading text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
                Washington <span className="text-brand-600 font-semibold">School</span>
              </span>
            </Link>
          </div>

          {/* Desktop Navigation Links */}
          {user && (
            <div className="hidden md:flex md:space-x-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === "/teacher"}
                    className={({ isActive }) =>
                      `flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                        isActive
                          ? "bg-brand-50 text-brand-700 font-semibold"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`
                    }
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.name}</span>
                  </NavLink>
                );
              })}
            </div>
          )}

          {/* User Profile / Auth State */}
          <div className="hidden md:flex md:items-center md:space-x-4">
            {user ? (
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-3 border-r border-slate-100 pr-4">
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="h-8 w-8 rounded-full border border-slate-200 bg-slate-50"
                  />
                  <div className="flex flex-col text-left">
                    <span className="text-xs font-semibold text-slate-800 leading-none">
                      {user.name}
                    </span>
                    <span className="text-[10px] font-medium text-slate-400 capitalize">
                      {user.role} Account
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center space-x-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-all hover:bg-slate-50 hover:text-slate-900"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition-all"
              >
                Sign In
              </Link>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="inline-flex items-center justify-center rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-500 focus:outline-none"
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden border-t border-slate-100 bg-white px-2 pt-2 pb-4 space-y-1 shadow-inner">
          {user ? (
            <>
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === "/teacher"}
                    onClick={() => setIsOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center space-x-3 px-4 py-2.5 rounded-xl text-base font-medium ${
                        isActive
                          ? "bg-brand-50 text-brand-700 font-semibold"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`
                    }
                  >
                    <Icon className="h-5 w-5" />
                    <span>{item.name}</span>
                  </NavLink>
                );
              })}
              <div className="border-t border-slate-100 mt-4 pt-4 px-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="h-9 w-9 rounded-full border border-slate-200 bg-slate-50"
                  />
                  <div className="flex flex-col text-left">
                    <span className="text-sm font-semibold text-slate-800">
                      {user.name}
                    </span>
                    <span className="text-xs font-medium text-slate-400 capitalize">
                      {user.role}
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center space-x-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </>
          ) : (
            <div className="px-4 py-2">
              <Link
                to="/login"
                onClick={() => setIsOpen(false)}
                className="flex w-full items-center justify-center rounded-xl bg-slate-900 py-2.5 text-center text-sm font-semibold text-white shadow-sm"
              >
                Sign In
              </Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
