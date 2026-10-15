import { LegalPage } from "@/components/LegalPage";
import { site } from "@/lib/site";

export const metadata = { title: "Impressum" };

export default function Impressum() {
  return (
    <LegalPage title="Impressum">
      <p>{site.company}<br />{site.street}<br />{site.postalCode} {site.city}</p>
      <p>Vertreten durch den Geschäftsführer {site.managingDirector}<br />{site.register}<br />USt-IdNr.: {site.vatId}</p>
      <p>E-Mail: {site.email}</p>
    </LegalPage>
  );
}
