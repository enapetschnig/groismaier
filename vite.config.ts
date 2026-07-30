import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(), 
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        // Achtung Fork-Altlast: Hier stand „Holzbau Lutz" — die installierte
        // App hieß dadurch am Startbildschirm falsch. theme_color = dasselbe
        // Blau wie <meta name="theme-color"> in index.html.
        name: 'Holzbau Groismaier — Zimmerei & Holzbau',
        short_name: 'Holzbau Groismaier',
        description: 'Angebote, Rechnungen, Kalkulation & Zeiterfassung',
        theme_color: '#002337',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 // 5 MB
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Größere schwere Libs in eigene Chunks → kleinerer First-Load.
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("jspdf") || id.includes("html2canvas") || id.includes("pdfjs-dist")) return "pdf";
          if (id.includes("xlsx") || id.includes("xlsx-js-style")) return "xlsx";
          if (id.includes("@radix-ui")) return "radix";
          if (id.includes("recharts") || id.includes("d3-")) return "charts";
          if (id.includes("date-fns")) return "date-fns";
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
}));
