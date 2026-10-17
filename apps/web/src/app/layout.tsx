import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "@kitty/ui/styles/globals.css";
import { Providers } from "./providers";

// Brand fonts (docs/15-ui-ux.md §1): Inter for UI, JetBrains Mono for money and IDs.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kitty",
  description: "Let your agents spend. On a leash.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
