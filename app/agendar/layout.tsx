import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agendamento online",
  description: "Escolha seu serviço e reserve um horário com sua barbearia.",
  icons: { icon: "/booking-icon.svg", shortcut: "/booking-icon.svg", apple: "/booking-icon.svg" },
};

export default function BookingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
