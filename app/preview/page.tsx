import { notFound } from "next/navigation";
import { TodayPreview } from "@/components/today-preview";

export default function PreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <TodayPreview />;
}
