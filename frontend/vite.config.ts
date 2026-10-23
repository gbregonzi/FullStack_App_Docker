import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Configure Vite and proxy browser API requests to the local FastAPI service. */
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});
