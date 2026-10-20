// Beim Start des Servers: Anwesenheits-Mails im Hintergrund regelmäßig aus dem Postfach holen (nur wenn IMAP eingerichtet ist)
// und die nächtliche Datensicherung planen (02:30 Uhr Berliner Zeit, verpasste wird nachgeholt)
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAttendancePolling } = await import("./lib/attendance/import");
    startAttendancePolling();
    const { startBackupSchedule } = await import("./lib/backup/run");
    startBackupSchedule();
  }
}
