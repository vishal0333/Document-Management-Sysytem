import React from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";

const Layout = ({ children }) => {
  return (
    <div className="flex">

      {/* Sidebar */}
      <Sidebar />

      {/* Main Area */}
      <div className="flex-1 flex flex-col">

        <Header />

        <div className="p-8 bg-slate-100 min-h-screen">
          {children}
        </div>

      </div>
    </div>
  );
};

export default Layout;