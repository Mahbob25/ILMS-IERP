import "@/app/globals.css";

export const metadata = {
  title: "Al-Drasat Institute",
  description: "معهد الدراسات — تعز · لغات · برمجة · ذكاء اصطناعي · دبلومات",
};

export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const locale = params?.locale || "ar";
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir} className="h-full scroll-smooth">
      <body className="h-full bg-[#FFFBF0] antialiased">
        {children}
      </body>
    </html>
  );
}
