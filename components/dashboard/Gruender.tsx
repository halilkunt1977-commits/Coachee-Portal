import { getT } from "@/lib/i18n-server";
import { DURCHSCHNITT, findeHebesatz } from "@/lib/tax/hebesaetze";
import { GewerbesteuerRechner } from "./GewerbesteuerRechner";

/** Ort eintragen, hell gestaltet (die Variante im Kopfband ist für dunklen Grund). Ohne action (Coach-Werkzeuge) nur als Suche über ?ort= */
async function OrtForm({ action, city }: { action?: (fd: FormData) => Promise<void>; city: string | null }) {
  const t = await getT();
  return (
    <form action={action} className="flex flex-wrap gap-2">
      <input name={action ? "city" : "ort"} defaultValue={city ?? ""} placeholder={t("z. B. Nürnberg")} aria-label={t("Ort des Unternehmens")} className="input min-w-0 flex-1 basis-40 py-2" />
      <button className="btn-ghost">{action ? t("Speichern") : t("Anzeigen")}</button>
    </form>
  );
}

/** Gewerbesteuer-Hebesatz am Ort des Coachees mit Erklärung und Beispielrechnung */
export async function HebesatzCard({ city, action, title = "Gewerbesteuer an deinem Ort" }: { city: string | null; action?: (fd: FormData) => Promise<void>; title?: string }) {
  const t = await getT();
  const found = findeHebesatz(city);
  const h = found?.treffer;
  return (
    <section className="card space-y-4">
      <div>
        <h2 className="h2">{t(title)}</h2>
        <p className="text-sm text-muted">{t("Jede Gemeinde legt mit dem Hebesatz selbst fest, wie hoch die Gewerbesteuer bei ihr ist.")}</p>
      </div>
      {h ? (
        <>
          <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-tint p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">{t("Hebesatz {ort}", { ort: h.gemeinde })}</p>
              <p className="font-[family-name:var(--font-display)] text-4xl font-bold tabular-nums">{h.hebesatz} %</p>
            </div>
            <div className="min-w-0 flex-1 basis-48 text-sm text-muted">
              <p>{h.landName} · {h.quelle}</p>
              <p>
                {t("Bundesdurchschnitt {p} %", { p: DURCHSCHNITT.bund })}{DURCHSCHNITT.land[h.land] ? `, ${h.landName} ${DURCHSCHNITT.land[h.land]} %` : ""}
                {h.hebesatz < DURCHSCHNITT.bund ? ` – ${t("dein Ort liegt darunter.")}` : h.hebesatz > DURCHSCHNITT.bund ? ` – ${t("dein Ort liegt darüber.")}` : "."}
              </p>
            </div>
          </div>
          {h.jahr < 2025 && <p className="text-xs text-muted">{t("Dieser Wert ist von {jahr}. Bitte auf der Website der Gemeinde nachsehen, ob er noch gilt (Stichwort „Hebesatzsatzung“).", { jahr: h.jahr })}</p>}
          {found.weitere.length > 0 && (
            <p className="text-xs text-muted">
              {t("Gleicher Name: {liste}. Stimmt der Ort nicht, trag ihn unten genauer ein.", { liste: found.weitere.map((w) => `${w.gemeinde} (${w.landName}) ${w.hebesatz} %`).join(", ") })}
            </p>
          )}
          <GewerbesteuerRechner hebesatz={h.hebesatz} ort={h.gemeinde} />
          <details className="text-sm" open={!action}>
            <summary className="cursor-pointer text-muted">{action ? t("Anderen Ort eintragen") : t("Anderen Ort anzeigen")}</summary>
            <div className="pt-2"><OrtForm action={action} city={city} /></div>
          </details>
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">
            {city
              ? t("Für „{ort}“ haben wir keinen Hebesatz in unserer Liste. Sie enthält alle Städte ab 20.000 Einwohnern und alle Gemeinden in Mittelfranken. Den Wert findest du auf der Website deiner Gemeinde (Stichwort „Hebesatzsatzung“).", { ort: city })
              : t("Trag den Ort ein, an dem dein Unternehmen sitzen wird. Dann zeigen wir dir den Hebesatz und rechnen ein Beispiel.")}
          </p>
          <OrtForm action={action} city={city} />
          <p className="text-xs text-muted">{t("Bis dahin rechnen wir mit dem Bundesdurchschnitt von {p} %.", { p: DURCHSCHNITT.bund })}</p>
          <GewerbesteuerRechner hebesatz={DURCHSCHNITT.bund} ort={t("Durchschnitt")} />
        </div>
      )}
    </section>
  );
}

type Block = { title: string; intro?: string; points: string[] };

// Kurzwissen für Gründerinnen und Gründer, Stand 2026. Bewusst knapp; Details klärt das Coaching oder die Steuerberatung.
const WISSEN: Block[] = [
  {
    title: "Gewerbe oder freier Beruf?",
    intro: "Davon hängt ab, ob du ein Gewerbe anmeldest, Gewerbesteuer zahlst und in die IHK kommst.",
    points: [
      "Gewerbe: Handel, Handwerk, Gastronomie, Dienstleistungen, Onlineshop. Anmeldung beim Gewerbeamt deiner Gemeinde vor dem Start, Gebühr meist 20 bis 60 €. Das Gewerbeamt informiert Finanzamt, IHK oder Handwerkskammer und Berufsgenossenschaft.",
      "Freier Beruf (§ 18 EStG): z. B. Ärztin, Anwalt, Ingenieurin, Architekt, Journalistin, Übersetzer, Dozentin, Künstler. Keine Gewerbeanmeldung, keine Gewerbesteuer, keine IHK. Du meldest dich nur beim Finanzamt.",
      "Grenzfälle (z. B. Beratung, IT, Coaching) entscheidet das Finanzamt nach dem Fragebogen. Im Zweifel nachfragen, bevor du Rechnungen schreibst.",
    ],
  },
  {
    title: "Rechtsformen im Vergleich",
    points: [
      "Einzelunternehmen: allein, sofort startklar, kein Mindestkapital, einfache Buchhaltung (EÜR). Du haftest mit deinem gesamten Privatvermögen. Kosten: nur die Gewerbeanmeldung. Eintrag als e. K. ins Handelsregister ist freiwillig, ab größerem Umfang Pflicht.",
      "GbR: zwei oder mehr Personen, Vertrag formfrei (schriftlich dringend empfohlen). Alle haften persönlich und jeder für alles. Seit 2024 kann sie ins Gesellschaftsregister (eGbR), nötig z. B. für Immobilien. Kosten gering.",
      "UG (haftungsbeschränkt): GmbH im Kleinformat ab 1 € Stammkapital, sinnvoll sind ein paar Tausend Euro. Haftung auf das Firmenvermögen begrenzt. Ein Viertel des Gewinns muss in die Rücklage, bis 25.000 € erreicht sind. Notar und Handelsregister rund 400 bis 900 €, dazu Bilanz und meist eine Steuerberatung.",
      "GmbH: 25.000 € Stammkapital, bei Gründung mindestens 12.500 € eingezahlt. Haftung begrenzt, wirkt bei Banken und Großkunden seriös. Gründung rund 800 bis 1.500 €, Bilanzpflicht, laufende Kosten höher. Steuer: 15 % Körperschaftsteuer plus Soli plus Gewerbesteuer ohne Freibetrag.",
      "Achtung bei UG und GmbH: Geschäftsführer haften trotzdem persönlich, z. B. bei verspätetem Insolvenzantrag oder nicht abgeführten Sozialabgaben.",
    ],
  },
  {
    title: "Geschäftskonto",
    points: [
      "Einzelunternehmen dürfen gesetzlich ein Privatkonto nutzen, viele Banken verbieten das aber in ihren Bedingungen. Ein eigenes Konto trennt Geschäft und Privat sauber und spart Zeit bei der Buchhaltung.",
      "UG und GmbH brauchen ein Geschäftskonto schon vor der Eintragung, um das Stammkapital einzuzahlen.",
      "Vergleichen: Kontoführung, Kosten pro Buchung, Bargeld-Einzahlung, Karten, Schnittstelle zur Buchhaltungssoftware. Für Förderkredite (z. B. KfW-Startgeld) brauchst du eine Hausbank.",
    ],
  },
  {
    title: "Finanzamt: Fragebogen zur steuerlichen Erfassung",
    points: [
      "Innerhalb eines Monats nach dem Start, nur online über ELSTER (elster.de, Zugang vorher beantragen, das dauert ein bis zwei Wochen).",
      "Du gibst Umsatz und Gewinn für dieses und nächstes Jahr an. Daraus setzt das Finanzamt Vorauszahlungen fest. Realistisch schätzen, nicht zu hoch und nicht zu niedrig.",
      "Hier entscheidest du dich auch für oder gegen die Kleinunternehmerregelung und beantragst bei Bedarf eine Umsatzsteuer-Identifikationsnummer (für Geschäfte mit dem EU-Ausland).",
      "Danach bekommst du deine Steuernummer. Sie gehört auf jede Rechnung.",
    ],
  },
  {
    title: "Kleinunternehmerregelung (Stand 2026)",
    points: [
      "Keine Umsatzsteuer auf deinen Rechnungen, wenn der Umsatz im Vorjahr höchstens 25.000 € (netto) war und im laufenden Jahr 100.000 € nicht übersteigt.",
      "Im Gründungsjahr gilt die Grenze von 25.000 €. Wer darüber kommt, muss ab diesem Umsatz Umsatzsteuer berechnen, nicht erst im nächsten Jahr. Ebenso sofort bei mehr als 100.000 € im laufenden Jahr.",
      "Auf der Rechnung steht dann ein Hinweis wie „Steuerbefreiung nach § 19 UStG“. Vorsteuer aus Einkäufen bekommst du nicht zurück.",
      "Lohnt sich vor allem bei Privatkunden. Bei Firmenkunden und hohen Anschaffungen ist der Verzicht oft günstiger. Der Verzicht bindet dich fünf Jahre.",
    ],
  },
  {
    title: "Umsatzsteuer",
    points: [
      "Regelsatz 19 %, ermäßigt 7 % (z. B. Lebensmittel, Bücher, Speisen im Restaurant). Manche Leistungen sind ganz befreit, etwa Heilbehandlungen.",
      "Du sammelst die Umsatzsteuer für das Finanzamt ein und ziehst die Vorsteuer aus deinen Einkäufen ab. Die Differenz meldest du per Umsatzsteuer-Voranmeldung, meist vierteljährlich, bei mehr als 9.000 € Steuer im Jahr monatlich.",
      "Tipp: Umsatzsteuer nie als eigenes Geld sehen. Am besten gleich auf ein Unterkonto legen.",
    ],
  },
  {
    title: "Buchhaltung, Belege, E-Rechnung",
    points: [
      "EÜR (Einnahmen-Überschuss-Rechnung): für Freiberufler, Einzelunternehmen und GbR, solange Umsatz unter 800.000 € und Gewinn unter 80.000 € im Jahr liegen. Einnahmen minus Ausgaben, abgegeben mit der Anlage EÜR.",
      "Bilanz mit doppelter Buchführung: Pflicht für UG, GmbH und eingetragene Kaufleute sowie für Gewerbetreibende über den genannten Grenzen.",
      "Aufbewahren: Buchungsbelege wie Rechnungen und Kontoauszüge 8 Jahre, Bücher und Jahresabschlüsse 10 Jahre, Geschäftsbriefe 6 Jahre.",
      "E-Rechnung: Seit 2025 muss jedes Unternehmen E-Rechnungen (XRechnung, ZUGFeRD) von anderen Firmen empfangen können, eine E-Mail-Adresse reicht dafür. Selbst ausstellen ist Pflicht ab 2027 bei mehr als 800.000 € Vorjahresumsatz, ab 2028 für alle. Kleinunternehmer sind davon ausgenommen.",
      "Gleich zu Beginn eine Buchhaltungssoftware nutzen und Belege laufend ablegen. Das spart später viel Ärger und Steuerberatungskosten.",
    ],
  },
  {
    title: "Versicherungen",
    points: [
      "Krankenversicherung ist Pflicht: freiwillig gesetzlich (Beitrag nach Einkommen, es gilt ein Mindestbeitrag) oder privat. Der Wechsel zurück in die gesetzliche ist später schwer.",
      "Rentenversicherung: für die meisten freiwillig. Pflicht z. B. für Lehrkräfte und Dozenten ohne Angestellte, Handwerker in der Handwerksrolle, Hebammen; Künstler und Publizisten über die Künstlersozialkasse.",
      "Arbeitslosenversicherung: Wer vorher angestellt war, kann sich innerhalb von drei Monaten nach dem Start freiwillig weiterversichern. Gute Absicherung, falls es nicht klappt.",
      "Betriebs- oder Berufshaftpflicht ist für fast alle sinnvoll. Für Beratung oft eine Vermögensschadenhaftpflicht. Dazu je nach Fall Berufsunfähigkeit, Inhalt und Elektronik.",
      "Berufsgenossenschaft: Innerhalb einer Woche nach dem Start anmelden. Für Angestellte ist sie Pflicht, für dich selbst oft freiwillig möglich.",
    ],
  },
  {
    title: "IHK und Handwerkskammer",
    points: [
      "Mit der Gewerbeanmeldung wirst du automatisch Mitglied der Industrie- und Handelskammer (IHK), im Handwerk der Handwerkskammer (HWK). Freie Berufe gehören nicht dazu.",
      "Der Beitrag richtet sich nach dem Gewinn. Kleine Gewerbe und Gründerinnen und Gründer in den ersten Jahren zahlen oft nichts oder wenig.",
      "Für zulassungspflichtige Handwerke (z. B. Elektriker, Friseur, Kfz) brauchst du den Meister oder eine gleichwertige Qualifikation und den Eintrag in die Handwerksrolle.",
      "Beide Kammern bieten kostenlose Gründungsberatung, Seminare und Musterverträge.",
    ],
  },
];

/** Wissen für Gründer: aufklappbare Abschnitte, auf dem Handy gut lesbar */
export async function GruenderWissen() {
  const t = await getT();
  return (
    <section className="card space-y-3">
      <div>
        <h2 className="h2">{t("Wissen für Gründer")}</h2>
        <p className="text-sm text-muted">{t("Das Wichtigste in Kürze. Fragen dazu besprechen wir gern im nächsten Termin.")}</p>
      </div>
      <div className="divide-y divide-line-soft rounded-2xl border border-line-soft">
        {WISSEN.map((b) => (
          <details key={b.title} className="group px-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 font-semibold [&::-webkit-details-marker]:hidden">
              {t(b.title)}
              <span className="text-muted transition group-open:rotate-90" aria-hidden>›</span>
            </summary>
            <div className="space-y-2 pb-4 text-sm leading-relaxed">
              {b.intro && <p className="text-muted">{t(b.intro)}</p>}
              <ul className="list-disc space-y-1.5 pl-5">
                {b.points.map((p) => <li key={p}>{t(p)}</li>)}
              </ul>
            </div>
          </details>
        ))}
      </div>
      <p className="text-xs text-muted">{t("Allgemeine Informationen, Stand 2026, keine Steuer- oder Rechtsberatung.")}</p>
    </section>
  );
}
