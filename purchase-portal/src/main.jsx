import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "antd/dist/reset.css";
import "./style.css";
import { msalInstance } from "./msalInstance";

const renderApp = () => {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
};

async function start() {
  try {
    await msalInstance.initialize();
  } catch (error) {
    console.error("MSAL init failed:", error);
  } finally {
    renderApp();
  }
}

start();