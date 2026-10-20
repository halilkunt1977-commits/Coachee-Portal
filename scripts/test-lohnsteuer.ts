// Prüft den Brutto-Netto-Rechner gegen Referenzwerte. Aufruf: npx jiti scripts/test-lohnsteuer.ts
import { bruttoNetto, lohnsteuerJahr, tarif, type PapInput, type Steuerklasse } from "../lib/tax/lohnsteuer";

let fails = 0;
const check = (name: string, got: number, want: number) => {
  const ok = Math.abs(got - want) < 0.005;
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FEHLER"} ${name}: ${got} ${ok ? "" : `(erwartet ${want})`}`);
};

// Einkommensteuer-Grundtabelle 2026 (§ 32a EStG): Nullzone, Zonengrenzen, Spitzensteuersatz
check("Tarif 12.348 €", tarif(12348), 0);
check("Tarif 17.799 €", tarif(17799), 1034);
// An der Grenze zur 42-%-Zone liefern beide Formeln dasselbe: 0,42 × 69.878 − 11.135,63 = 18.213,13
check("Tarif 69.878 €", tarif(69878), 18213);
check("Tarif 277.825 €", tarif(277825), 105550);

// Prüftabellen des BMF zum PAP 2026 (Anlage 1 zum BMF-Schreiben vom 12.11.2025), Jahreslohnsteuer in Euro.
// Allgemeine Tabelle: in allen Zweigen versichert, KVZ 2,90 %, Kinderlosenzuschlag außer in Steuerklasse II.
const ALLGEMEIN: Record<number, number[]> = {
  20000: [380, 0, 0, 380, 2234, 2766],
  30000: [2248, 1230, 0, 2248, 5588, 6120],
  40000: [4407, 3293, 1000, 4407, 8720, 9218],
  50000: [6788, 5580, 2810, 6788, 12010, 12542],
  60000: [9389, 8091, 4822, 9389, 15364, 15895],
  75000: [13922, 12476, 8206, 13922, 20633, 21165],
  100000: [23248, 21634, 15012, 23248, 30157, 30689],
};
// Besondere Tabelle: nicht sozialversichert, private KV/PV 300 € (Klasse III 500 €, Klasse VI 0 €) ohne Zuschuss
const BESONDERS: Record<number, number[]> = {
  20000: [461, 0, 0, 461, 2415, 4459],
  30000: [2886, 1788, 0, 2886, 6615, 8460],
  40000: [5710, 4464, 1420, 5710, 10529, 12573],
  50000: [8880, 7487, 3824, 8880, 14729, 16773],
  60000: [12396, 10856, 6430, 12396, 18929, 20973],
  75000: [18320, 16559, 10666, 18320, 25229, 27273],
  100000: [28820, 27031, 18590, 28820, 35729, 37773],
};
const base: Omit<PapInput, "re4" | "stkl"> = { zkf: 0, kvz: 2.9, pvs: 0, pvz: 1, pva: 0, krv: 0, alv: 0, pkv: 0, pkpv: 0, pkpvagz: 0 };
for (const [lohn, row] of Object.entries(ALLGEMEIN))
  row.forEach((want, i) => {
    const stkl = (i + 1) as Steuerklasse;
    check(`Allgemein ${lohn} € Kl. ${stkl}`, lohnsteuerJahr({ ...base, re4: Number(lohn), stkl, pvz: stkl === 2 ? 0 : 1 }).lstjahr, want);
  });
for (const [lohn, row] of Object.entries(BESONDERS))
  row.forEach((want, i) => {
    const stkl = (i + 1) as Steuerklasse;
    const pkpv = stkl === 3 ? 500 : stkl === 6 ? 0 : 300;
    check(`Besonders ${lohn} € Kl. ${stkl}`, lohnsteuerJahr({ ...base, re4: Number(lohn), stkl, krv: 1, alv: 1, pkv: 1, pkpv }).lstjahr, want);
  });

// Soli: unter der Freigrenze 0, knapp darüber die Milderungszone (11,9 % vom Überschreitungsbetrag), Splitting doppelt
check("Soli 100.000 € Kl. I", lohnsteuerJahr({ ...base, re4: 100000, stkl: 1 }).solzj, 344.86); // (23.248 − 20.350) × 11,9 %
check("Soli 75.000 € Kl. I", lohnsteuerJahr({ ...base, re4: 75000, stkl: 1 }).solzj, 0);
check("Soli 100.000 € Kl. III", lohnsteuerJahr({ ...base, re4: 100000, stkl: 3 }).solzj, 0);
// Kinderfreibetrag senkt nur die Bemessung für Soli/Kirchensteuer, nicht die Lohnsteuer
const kind = lohnsteuerJahr({ ...base, re4: 50000, stkl: 1, zkf: 1 });
check("Kl. I 1 KFB: Lohnsteuer unverändert", kind.lstjahr, 6788);
check("Kl. I 1 KFB: Bemessung Kirchensteuer", kind.jbmg, tarif(Math.floor(kind.zve - 9756)));

// Monatswerte 4.000 € brutto, Kl. I, Bayern, Kirche, kinderlos, Zusatzbeitrag 2,9 %
const r = bruttoNetto({ bruttoJahr: 48000, steuerklasse: 1, kinderfreibetraege: 0, kirche: true, bundesland: "BY", kinder: 0, ab23: true, kvZusatz: 2.9, gesetzlich: true });
check("4.000 €: KV 8,45 %", r.monat.kv, 338);
check("4.000 €: PV 1,8 % + 0,6 %", r.monat.pv, 96);
check("4.000 €: RV 9,3 %", r.monat.rv, 372);
check("4.000 €: AV 1,3 %", r.monat.av, 52);
check("4.000 €: Kirchensteuer 8 % der Lohnsteuer", r.monat.kirchensteuer, Math.floor(r.monat.lohnsteuer * 8) / 100);
check("4.000 €: Netto = Brutto − Abzüge", r.monat.netto, Math.round((4000 - r.monat.lohnsteuer - r.monat.soli - r.monat.kirchensteuer - 338 - 96 - 372 - 52) * 100) / 100);
// Über der Beitragsbemessungsgrenze: KV/PV auf 5.812,50 €, RV/AV auf 8.450 € gedeckelt
const hoch = bruttoNetto({ bruttoJahr: 120000, steuerklasse: 1, kinderfreibetraege: 0, kirche: false, bundesland: "NW", kinder: 0, ab23: true, kvZusatz: 2.9, gesetzlich: true });
check("10.000 €: KV gedeckelt", hoch.monat.kv, 491.16);
check("10.000 €: RV gedeckelt", hoch.monat.rv, 785.85);
console.log("Beispiel 4.000 € Kl. I BY Kirche:", r.monat);

if (fails) {
  console.error(`${fails} Abweichung(en)`);
  process.exit(1);
}
console.log("Alle Werte stimmen.");
