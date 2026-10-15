import Link from "next/link";
import { AuthCard } from "@/components/ui";
import ResetForm from "./ResetForm";

export const metadata = { title: "Passwort vergessen" };

export default function ForgotPage() {
  return (
    <AuthCard title="Passwort vergessen" intro="Wir schicken dir einen Link, mit dem du ein neues Passwort festlegen kannst.">
      <ResetForm />
      <p className="mt-4 text-center text-sm"><Link href="/login" className="link">Zurück zur Anmeldung</Link></p>
    </AuthCard>
  );
}
