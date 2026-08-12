import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Connected | A simple social feed",
  description: "Share posts, follow people, stay close",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
