import { PublicClientApplication } from "@azure/msal-browser";

export const msalInstance = new PublicClientApplication({
  auth: {
    clientId: "5099564c-a6f8-4cc1-9d77-232e4acc8aaa",
    authority: "https://login.microsoftonline.com/0b3ab4ca-fd6e-4b4e-97b8-77cc0c8a00d6",
    redirectUri: "http://localhost:5173"
  }
});