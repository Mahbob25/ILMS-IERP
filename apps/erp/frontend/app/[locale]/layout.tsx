import { AuthProvider } from "@/components/AuthContext";

export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const locale = params?.locale || "ar";
  const dir = locale === "ar" ? "rtl" : "ltr";
  // Arabic styling comes from <body> in the root layout; only non-Arabic
  // locales need a font/leading override on the wrapper.
  const fontClass = locale === "ar" ? "" : "font-sans leading-normal";

  return (
    <div dir={dir} className={`${fontClass} h-full`}>
      <AuthProvider>
        {children}
      </AuthProvider>
    </div>
  );
}
