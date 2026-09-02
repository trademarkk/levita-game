import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Золотая Саванна: Путь к Вершине",
  description: "Командная игровая гонка LEVITA — путь к вершине",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
