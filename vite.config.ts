import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    open: true,
  },
  define: {
    "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify("https://vfhtxpjkgkoezxeutwco.supabase.co"),
    "process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("sb_publishable_ANG24UI1UIbQ_PuAsa326Q_xVC0AhzO"),
  },
});
