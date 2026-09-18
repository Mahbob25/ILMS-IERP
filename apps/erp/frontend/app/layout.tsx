import "@/app/globals.css";

export const metadata = {
  title: "Al-Drasat ERP",
  description: "نظام إدارة معهد الدراسات واللغات وعلوم الكمبيوتر - Al-Drasat ERP",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // NOTE: <html>/<body> must live in the ROOT layout (Next.js requirement).
  // The [locale] layout below only adjusts direction/fonts per locale via a
  // wrapper div — defaults here are Arabic-first (the primary locale).
  return (
    <html lang="ar" dir="rtl" className="h-full scroll-smooth">
      <body className="font-arabic leading-relaxed h-full text-slate-900 bg-slate-50 antialiased">
        {children}
      </body>
    </html>
  );
}
