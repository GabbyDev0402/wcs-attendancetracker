import React, { useState, useRef } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Menu, X, CalendarCheck, BarChart3, ClipboardCheck, LogOut, School, Users, BookOpen, Sun, Moon, ChevronLeft, ChevronRight } from "lucide-react";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const navContainerRef = useRef(null);

  const [theme, setTheme] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("theme");
      if (saved) return saved;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "light";
  });

  React.useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === "light" ? "dark" : "light"));

  const scrollNav = (direction) => {
    if (navContainerRef.current) {
      const scrollAmount = direction === "left" ? -180 : 180;
      navContainerRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
    setIsOpen(false);
  };

  const navItems = user?.role === "teacher" 
    ? [
        { name: "Dashboard", path: "/teacher", icon: CalendarCheck },
        { name: "Take Attendance", path: "/teacher/log", icon: ClipboardCheck },
        { name: "Lesson Reports", path: "/teacher/lesson-reports", icon: BookOpen },
        { name: "Monthly Reports", path: "/teacher/reports", icon: BarChart3 },
        { name: "Student Roster", path: "/teacher/roster", icon: Users }
      ]
    : user?.role === "admin"
    ? [
        { name: "Admin Console", path: "/admin", icon: School }
      ]
    : user?.role === "student"
    ? [
        { name: "Student Portal", path: "/student", icon: CalendarCheck }
      ]
    : [];

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-slate-100 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md transition-colors duration-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between items-center gap-2">
          {/* Logo and Brand */}
          <div className="flex items-center shrink-0">
            <Link to="/" className="flex items-center space-x-2.5 group text-left">
              <img 
                src="/logo.png" 
                alt="Washington School Logo" 
                className="h-9 w-9 object-contain rounded-lg border border-slate-100 dark:border-slate-800 transition-all group-hover:scale-105 shrink-0 bg-white"
              />
              <span className="font-heading text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap transition-colors">
                Washington <span className="text-brand-600 font-semibold">School</span>
              </span>
            </Link>
          </div>

          {/* Desktop Navigation Links with Scroll Controls */}
          {user && (
            <div className="hidden md:flex items-center mx-1 lg:mx-3 shrink min-w-0 max-w-full">
              <button
                type="button"
                onClick={() => scrollNav("left")}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0 mr-0.5"
                title="Scroll Left"
                aria-label="Scroll Left"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div
                ref={navContainerRef}
                className="flex items-center space-x-1 lg:space-x-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden py-1 min-w-0 scroll-smooth"
              >
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === "/teacher"}
                      className={({ isActive }) =>
                        `flex items-center space-x-1.5 lg:space-x-2 px-2.5 lg:px-3 py-1.5 lg:py-2 rounded-xl text-xs lg:text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
                          isActive
                            ? "bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 font-semibold shadow-2xs dark:shadow-none"
                            : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200"
                        }`
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.name}</span>
                    </NavLink>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => scrollNav("right")}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0 ml-0.5"
                title="Scroll Right"
                aria-label="Scroll Right"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* User Profile / Auth State */}
          <div className="hidden md:flex md:items-center space-x-2 lg:space-x-3 shrink-0 ml-auto">
            {user ? (
              <div className="flex items-center space-x-2 lg:space-x-3">
                <button
                  onClick={toggleTheme}
                  className="p-1.5 rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
                  aria-label="Toggle Dark Mode"
                >
                  {theme === "light" ? <Moon className="h-4 w-4 lg:h-5 lg:w-5" /> : <Sun className="h-4 w-4 lg:h-5 lg:w-5" />}
                </button>
                <div className="flex items-center space-x-2 lg:space-x-2.5 border-r border-slate-100 dark:border-slate-800 pr-2 lg:pr-3">
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="h-7 w-7 lg:h-8 lg:w-8 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 shrink-0"
                  />
                  <div className="hidden xl:flex flex-col text-left">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-none whitespace-nowrap transition-colors">
                      {user.name}
                    </span>
                    <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 capitalize whitespace-nowrap mt-0.5">
                      {user.role} Account
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center space-x-1 rounded-xl border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 transition-all hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-3">
                <button
                  onClick={toggleTheme}
                  className="p-1.5 rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
                  aria-label="Toggle Dark Mode"
                >
                  {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                </button>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center rounded-xl bg-slate-900 dark:bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm dark:shadow-md dark:shadow-blue-500/40 dark:hover:shadow-blue-500/60 hover:bg-slate-800 dark:hover:bg-brand-500 transition-all whitespace-nowrap shrink-0"
                >
                  Sign In
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="inline-flex items-center justify-center rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-500 dark:hover:text-slate-300 focus:outline-none"
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 px-2 pt-2 pb-4 space-y-1 shadow-inner transition-colors">
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
                          ? "bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 font-semibold"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200"
                      }`
                    }
                  >
                    <Icon className="h-5 w-5" />
                    <span>{item.name}</span>
                  </NavLink>
                );
              })}
              <div className="border-t border-slate-100 dark:border-slate-800 mt-4 pt-4 px-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="h-9 w-9 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                  <div className="flex flex-col text-left">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {user.name}
                    </span>
                    <span className="text-xs font-medium text-slate-400 dark:text-slate-500 capitalize">
                      {user.role}
                    </span>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={toggleTheme}
                    className="p-1.5 rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
                  >
                    {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex items-center space-x-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="px-4 py-2 space-y-2">
              <button
                onClick={toggleTheme}
                className="flex w-full items-center justify-center space-x-2 rounded-xl border border-slate-200 dark:border-slate-700 py-2.5 text-center text-sm font-medium text-slate-700 dark:text-slate-300 shadow-sm"
              >
                {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                <span>Toggle Theme</span>
              </button>
              <Link
                to="/login"
                onClick={() => setIsOpen(false)}
                className="flex w-full items-center justify-center rounded-xl bg-slate-900 dark:bg-brand-600 py-2.5 text-center text-sm font-semibold text-white shadow-sm dark:shadow-md dark:shadow-blue-500/40 dark:hover:shadow-blue-500/60 hover:bg-slate-800 dark:hover:bg-brand-500"
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
