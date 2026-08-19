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
  return children;
}
