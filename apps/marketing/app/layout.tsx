import "@/app/globals.css";

export const metadata = {
  title: "Al-Drasat Institute",
  description: "معهد الدراسات — تعز · لغات · برمجة · ذكاء اصطناعي · دبلومات",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // NOTE: <html>/<body> must live in the ROOT layout (Next.js requirement).
  // The [locale] layout below only adjusts direction per locale via a
  // wrapper div — defaults here are Arabic-first (the primary locale).
  return (
    <html lang="ar" dir="rtl" className="h-full scroll-smooth">
      <body className="h-full bg-[#FFFBF0] antialiased">
        {children}
      </body>
    </html>
  );
}
