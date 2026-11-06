import { FileViewer } from "@/components/app/FileViewer";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Datei ansehen" };

/** Dateien (PDF, Word, Excel) im Portal ansehen, mit eigenem „Zurück“-Knopf: in der App vom Home-Bildschirm gibt es keinen. */
export default async function Ansehen({ searchParams }: PageProps<"/ansehen">) {
  await requireUser();
  const sp = await searchParams;
  const src = typeof sp.src === "string" && sp.src.startsWith("/api/") && !sp.src.startsWith("//") ? sp.src : null;
  const name = typeof sp.name === "string" ? sp.name.slice(0, 120) : "";
  return <FileViewer src={src} name={name} />;
}
