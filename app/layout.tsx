import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vou de Barber — Gestão para barbearias",
  description: "Agenda, clientes, equipe e financeiro da sua barbearia em um só lugar.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
