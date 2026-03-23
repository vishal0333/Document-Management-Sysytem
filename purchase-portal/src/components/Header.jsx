import React from "react";
import { LogOut, Sparkles, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Header = ({ setRole }) => {

  const navigate = useNavigate();
  const username = localStorage.getItem("username");
  const role = localStorage.getItem("role");

 const handleLogout = () => {
  localStorage.clear();
  setRole(null);
  navigate("/login");
};

  return (
    <header className="w-full font-sans shadow-sm">

      {/*Top Bar */}
      <div
        className="w-full bg-cover bg-center bg-no-repeat px-4 py-3 md:px-6"
        style={{
          backgroundImage: 'url("/documentation_management_header.jpg")',
          backgroundPosition: "center 8%",
          backgroundSize: "cover"
        }}
      >
        <div className="flex flex-col gap-3 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur-sm md:flex-row md:items-center md:justify-between md:px-5">
          <div className="flex items-center gap-4 min-w-0">
            <div
              className="flex items-center gap-3 cursor-pointer shrink-0"
              onClick={() => navigate("/")}
            >
              <img
                src="/TERI%20Logo%20Seal.jpg"
                alt="Company Logo"
                className="h-11 w-auto max-w-[140px] object-contain shrink-0"
              />
              <span className="text-2xl font-bold tracking-tight text-white uppercase whitespace-nowrap">
                DMS Portal
              </span>
            </div>

            <div className="hidden lg:flex items-center gap-2 rounded-full border border-white/20 bg-white/15 px-3 py-1.5 text-white/95 text-sm font-medium min-w-0">
              <Sparkles size={14} />
              <span className="truncate">Welcome to DMS Purchase Approval Portal</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 md:justify-end shrink-0">
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-white/20 bg-white/15 px-3 py-1.5 text-white text-sm font-semibold whitespace-nowrap">
              <UserRound size={14} />
              <span>Logged in as: {username} ({role})</span>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-5 py-2 rounded-lg font-semibold border border-white/20 transition-all active:scale-95"
            >
              <LogOut size={18} />
              Logout
            </button>
          </div>

          <div className="sm:hidden text-white text-xs font-semibold">
            Logged in as: {username} ({role})
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;