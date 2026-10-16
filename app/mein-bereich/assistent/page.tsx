import { redirect } from "next/navigation";

// Den Assistenten gibt es nur noch für den Coach. Alte Links landen auf der Startseite.
export default function MyAssistant() {
  redirect("/mein-bereich");
}
