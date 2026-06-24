import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ChunkReloadGuard } from "@/components/layout/ChunkReloadGuard";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Óptica Boavista — Dashboard",
  description: "Dashboard de gestão Óptica Boavista",
};

// Aplica o tema guardado ANTES da hidratação (evita flash claro→escuro).
const themeScript = `try{if(localStorage.getItem('theme')==='light')document.documentElement.classList.add('light');}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="h-full antialiased">
        <ChunkReloadGuard />
        {children}
      </body>
    </html>
  );
}
