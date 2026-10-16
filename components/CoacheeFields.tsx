import type { Coachee } from "@/lib/access";
import { Field, Select, TextArea } from "./ui";

export function CoacheeFields({ c }: { c?: Partial<Coachee> }) {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Vorname" name="first_name" defaultValue={c?.first_name} required />
        <Field label="Nachname" name="last_name" defaultValue={c?.last_name} required />
        <Field label="E-Mail" name="email" type="email" defaultValue={c?.email} required hint="Darüber bekommt der Coachee seinen Zugang." />
        <Field label="Telefon" name="phone" type="tel" defaultValue={c?.phone ?? ""} />
        <Field label="Wohnort" name="city" defaultValue={c?.city ?? ""} hint="Für das Wetter auf der Startseite. Leer lassen, dann gilt der Ort aus dem Lebenslauf." />
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        <Select label="Coaching-Art" name="coaching_type" defaultValue={c?.coaching_type ?? "job"}>
          <option value="job">Jobcoaching</option>
          <option value="gruendung">Gründungscoaching</option>
        </Select>
        <Select label="Kostenträger" name="funding" defaultValue={c?.funding ?? "avgs"}>
          <option value="avgs">AVGS</option>
          <option value="selbstzahler">Selbstzahler</option>
          <option value="sonstiges">Sonstiges</option>
        </Select>
        <Field label="Gutschein- / Aktenzeichen" name="voucher_number" defaultValue={c?.voucher_number ?? ""} />
        <Field label="Bewilligte Unterrichtseinheiten" name="units_total" inputMode="decimal" defaultValue={c?.units_total ?? ""} hint="Zum Beispiel 40. Wird mit der Anwesenheit verrechnet." />
        <Select label="Bildungsträger" name="traeger" defaultValue={c?.traeger ?? ""} >
          <option value="">–</option>
          <option value="erfolgspfad">Erfolgspfad (Anwesenheit kommt per Mail)</option>
          <option value="avocons">AVOCONS (Anwesenheit selbst eintragen)</option>
          <option value="sonstige">Anderer Träger</option>
        </Select>
        <Field label="Beginn" name="start_date" type="date" defaultValue={c?.start_date ?? ""} />
        <Field label="Ende" name="end_date" type="date" defaultValue={c?.end_date ?? ""} />
      </section>
      <TextArea label="Ziel des Coachings" name="goal" defaultValue={c?.goal ?? ""} hint="Sieht auch der Coachee." />
      <TextArea label="Interne Notiz" name="internal_note" defaultValue={c?.internal_note ?? ""} hint="Nur für dich, der Coachee sieht das nie." />
    </div>
  );
}
