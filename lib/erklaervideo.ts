/*
 * Erklärvideo „So funktioniert dein Portal“: Dateien, Texte und die Stelle für den Vornamen auf der Titelkarte.
 * Ohne Datenbank, damit der Player im Browser dieselben Angaben nutzt.
 *
 * Die Videos liegen in public/videos/ und nennen keinen Namen. Eine neue Fassung (z. B. mit Sprecher) einfach unter
 * demselben Dateinamen ablegen und danach `sh scripts/erklaervideo-poster.sh` für die Standbilder laufen lassen.
 */

export const VIDEO_LANGUAGES = ["de", "tr"] as const;
export type VideoLanguage = (typeof VIDEO_LANGUAGES)[number];
export const isVideoLanguage = (v: unknown): v is VideoLanguage => v === "de" || v === "tr";
export const LANGUAGE_LABEL: Record<VideoLanguage, string> = { de: "Deutsch", tr: "Türkçe" };

export type CoachingType = "job" | "gruendung";

/** Hauptvideo und Standbild für Coaching-Art und Sprache */
export const videoFiles = (type: CoachingType, lang: VideoLanguage) => ({
  video: `/videos/erklaervideo-${type}-${lang}.mp4`,
  poster: `/videos/erklaervideo-${type}-${lang}.jpg`,
  titleCard: `/videos/titelkarte-${lang}.png`,
});

/**
 * Freie Stelle für den Vornamen auf der Titelkarte (1920 × 1080), wie in titelkarte-slot.json.
 * Der Player rechnet sie in Prozent der 16:9-Fläche um, damit der Name auf jeder Bildschirmbreite an derselben Stelle sitzt.
 */
export const TITLE_SLOT = { width: 1920, height: 1080, x: 260, y: 410, w: 1400, h: 190, sizePx: 150, color: "#f3d9a6" } as const;

/** Begrüßung vor dem Hauptvideo: als Sprache (falls eingerichtet) und als Text auf der Titelkarte */
const GREETING: Record<VideoLanguage, string> = {
  de: "Hallo {vorname}, schön, dass du da bist! Willkommen in deinem Portal bei Halil Kunt.",
  tr: "Merhaba {vorname}, sizi burada görmek çok güzel! Halil Kunt ile birlikte kullanacağınız portalınıza hoş geldiniz.",
};

/** Nur der Vorname, ohne Zeilenumbrüche und auf eine vernünftige Länge gekürzt */
export const cleanFirstName = (name: string) => name.replace(/\s+/g, " ").trim().slice(0, 60);

export const greetingText = (firstName: string, lang: VideoLanguage) => GREETING[lang].replace("{vorname}", cleanFirstName(firstName));

/** Beschriftungen von Player und Hilfe-Seite in beiden Sprachen (Türkisch in der Sie-Form wie im Video) */
export const PLAYER_TEXT = {
  de: {
    play: "Video abspielen",
    pause: "Pause",
    resume: "Weiter",
    replay: "Von vorn",
    skip: "Begrüßung überspringen",
    again: "Nochmal ansehen",
    loading: "Einen Moment …",
    ended: "Das war’s! Bei Fragen schreib deinem Coach im Posteingang.",
    noVideo: "Das Video lässt sich gerade nicht laden. Bitte versuche es später noch einmal.",
    region: "Erklärvideo",
  },
  tr: {
    play: "Videoyu oynat",
    pause: "Duraklat",
    resume: "Devam",
    replay: "Baştan",
    skip: "Selamlamayı atla",
    again: "Tekrar izle",
    loading: "Bir saniye …",
    ended: "Hepsi bu kadar! Sorularınız için gelen kutusundan koçunuza yazabilirsiniz.",
    noVideo: "Video şu anda yüklenemiyor. Lütfen daha sonra tekrar deneyin.",
    region: "Tanıtım videosu",
  },
} as const;

/** Adresse der gesprochenen Begrüßung (prüft auf dem Server, wer sie hören darf) */
export const greetingAudioHref = (coacheeId: string, lang: VideoLanguage) => `/api/begruessung/${coacheeId}?sprache=${lang}`;

export const HELP_PATH = "/mein-bereich/hilfe";

/** Text, den der Coach dem Coachee per Posteingang schicken kann (bei Türkisch zusätzlich auf Türkisch) */
export const videoMessage = (lang: VideoLanguage) =>
  lang === "tr" ? `Schau dir dein Erklärvideo an: ${HELP_PATH}\nTanıtım videonuzu buradan izleyebilirsiniz: ${HELP_PATH}` : `Schau dir dein Erklärvideo an: ${HELP_PATH}`;

/** Kapitel des Videos (wie in scenes.json) mit dem Bereich im Portal, in dem man es gleich ausprobieren kann */
type Chapter = { id: string; href: string | null; de: string; tr: string };
const CHAPTERS: Chapter[] = [
  { id: "01-anmelden", href: null, de: "Anmelden", tr: "Giriş yapmak" },
  { id: "02-start", href: "/mein-bereich", de: "Startseite", tr: "Ana sayfa" },
  { id: "03-posteingang", href: "/mein-bereich/posteingang", de: "Posteingang", tr: "Gelen kutusu" },
  { id: "04-aufgaben", href: "/mein-bereich/aufgaben", de: "Aufgaben", tr: "Görevler" },
  { id: "05-kalender", href: "/mein-bereich/kalender", de: "Kalender und Termine", tr: "Takvim" },
  { id: "06-stellen", href: "/mein-bereich/stellen", de: "Stellen finden", tr: "İş bulmak" },
  { id: "07-bewerbungen", href: "/mein-bereich/bewerbungen", de: "Bewerbungen", tr: "Başvurular" },
  { id: "08-anschreiben", href: "/mein-bereich/bewerbungen", de: "Anschreiben", tr: "Ön yazı" },
  { id: "14-businessplan", href: "/mein-bereich/businessplan", de: "Businessplan und Finanzplan", tr: "İş planı ve finans planı" },
  { id: "09-lebenslauf", href: "/mein-bereich/lebenslauf", de: "Lebenslauf", tr: "Özgeçmiş" },
  { id: "10-erfahrung", href: "/mein-bereich/erfahrung", de: "Erfahrungsbogen", tr: "Deneyim formu" },
  { id: "11-handbuch", href: "/mein-bereich/handbuch", de: "Mein Handbuch", tr: "El kitabım" },
  { id: "12-app", href: "/mein-bereich", de: "Portal als App", tr: "Telefonda uygulama gibi" },
  { id: "13-abschluss", href: null, de: "Auch nach dem Coaching", tr: "Koçluktan sonra da" },
];
const VARIANTS: Record<CoachingType, string[]> = {
  job: ["01-anmelden", "02-start", "03-posteingang", "04-aufgaben", "05-kalender", "06-stellen", "07-bewerbungen", "08-anschreiben", "09-lebenslauf", "10-erfahrung", "11-handbuch", "12-app", "13-abschluss"],
  gruendung: ["01-anmelden", "02-start", "03-posteingang", "04-aufgaben", "05-kalender", "14-businessplan", "09-lebenslauf", "11-handbuch", "12-app", "13-abschluss"],
};
export const chaptersFor = (type: CoachingType) => VARIANTS[type].map((id) => CHAPTERS.find((c) => c.id === id)!);

/** Texte der Hilfe-Seite */
export const HELP_TEXT = {
  de: {
    eyebrow: "Hilfe",
    title: "So funktioniert dein Portal",
    intro: "Ein kurzes Video für dich: was du wo findest und wie du am besten startest. Dauert nur ein paar Minuten.",
    chapters: "Das zeigt dir das Video",
    language: "Sprache des Videos",
    question: "Noch Fragen? Schreib deinem Coach im Posteingang.",
    toInbox: "Zum Posteingang",
  },
  tr: {
    eyebrow: "Yardım",
    title: "Portalınız nasıl çalışır",
    intro: "Size özel kısa bir video: neyi nerede bulacağınızı ve en iyi nasıl başlayacağınızı gösterir. Sadece birkaç dakika sürer.",
    chapters: "Videoda neler var",
    language: "Video dili",
    question: "Sorunuz mu var? Gelen kutusundan koçunuza yazın.",
    toInbox: "Gelen kutusuna git",
  },
} as const;
