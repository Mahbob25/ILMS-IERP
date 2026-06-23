import "@/app/globals.css";
import { AuthProvider } from "@/components/AuthContext";

export const metadata = {
  title: "نظام إدارة المعهد | LIMS Portal",
  description: "نظام إدارة المعهد التعليمي الشامل مع معالجة المناهج بالذكاء الاصطناعي",
};

export default function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const locale = params?.locale || "ar";
  const dir = locale === "ar" ? "rtl" : "ltr";
  const fontClass = locale === "ar" ? "font-arabic leading-relaxed" : "font-sans leading-normal";

  return (
    <html lang={locale} dir={dir} className="h-full scroll-smooth">
      <body className={`${fontClass} h-full text-slate-900 bg-slate-50 antialiased`}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
