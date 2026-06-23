import { redirect } from "next/navigation";

export default function RootPage() {
  // Fallback redirect if middleware is bypassed
  redirect("/ar/login");
}
