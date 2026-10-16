// Beim Start des Servers: Anwesenheits-Mails im Hintergrund regelmäßig aus dem Postfach holen (nur wenn IMAP eingerichtet ist)
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAttendancePolling } = await import("./lib/attendance/import");
    startAttendancePolling();
  }
}
