"use client";

/*
 * Gegenüber im Interview-Training: gezeichnete Person von Gründarium (Interviewerin oder Interviewer) in einem hellen
 * Büro. level (0–1) ist die Lautstärke der Stimme gerade: Der Mund geht mit, die Augen blinzeln von selbst.
 */
export function Interviewer({ voice, level, speaking = false }: { voice: "f" | "m"; level: number; speaking?: boolean }) {
  const open = Math.max(0, Math.min(1, level));
  const skin = voice === "f" ? "#e9b896" : "#d9a37f";
  const hair = voice === "f" ? "#3b2a22" : "#2b211c";
  const mouthRy = 1.2 + open * 7;
  return (
    <svg viewBox="0 0 400 300" className="size-full" role="img" aria-label={voice === "f" ? "Interviewerin" : "Interviewer"}>
      <defs>
        <linearGradient id={`wall-${voice}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eef1f6" />
          <stop offset="1" stopColor="#dde3ec" />
        </linearGradient>
        <clipPath id={`frame-${voice}`}><rect width="400" height="300" /></clipPath>
      </defs>
      <g clipPath={`url(#frame-${voice})`}>
        <rect width="400" height="300" fill={`url(#wall-${voice})`} />
        {/* Büro: Fenster, Regal, Pflanze */}
        <rect x="24" y="30" width="110" height="130" rx="6" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="3" />
        <line x1="79" y1="30" x2="79" y2="160" stroke="#cbd5e1" strokeWidth="3" />
        <line x1="24" y1="95" x2="134" y2="95" stroke="#cbd5e1" strokeWidth="3" />
        <rect x="290" y="70" width="92" height="8" rx="2" fill="#b9c2cf" />
        <rect x="298" y="44" width="10" height="26" fill="#1f3a5f" /><rect x="310" y="48" width="9" height="22" fill="#c9a24b" /><rect x="321" y="42" width="11" height="28" fill="#5b7a99" />
        <rect x="290" y="120" width="92" height="8" rx="2" fill="#b9c2cf" />
        <circle cx="355" cy="104" r="14" fill="#6b9a6b" /><rect x="349" y="104" width="12" height="16" rx="2" fill="#8a6a50" />
        {/* Logo-Ecke */}
        <rect x="300" y="250" width="86" height="26" rx="13" fill="#1f3a5f" opacity=".9" />
        <text x="343" y="267" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">gründarium</text>

        {/* Haare hinten (nur Interviewerin, lang) */}
        {voice === "f" && <path d="M138 128 C 132 70, 268 70, 262 128 L 272 236 C 250 250, 150 250, 128 236 Z" fill={hair} />}
        {/* Oberkörper: Blazer, Hemd/Bluse */}
        <path d="M92 300 C 100 236, 150 214, 200 214 C 250 214, 300 236, 308 300 Z" fill="#1f3a5f" />
        <path d="M176 216 L 200 262 L 224 216 Z" fill={voice === "f" ? "#f4efe6" : "#ffffff"} />
        {voice === "m" && <path d="M196 226 L 204 226 L 207 262 L 200 272 L 193 262 Z" fill="#c9a24b" />}
        <path d="M176 216 L 160 300 L 150 300 L 168 218 Z" fill="#17304f" /><path d="M224 216 L 240 300 L 250 300 L 232 218 Z" fill="#17304f" />
        {/* Hals und Kopf */}
        <rect x="186" y="186" width="28" height="34" rx="10" fill={skin} />
        <ellipse cx="200" cy="140" rx="52" ry="62" fill={skin} />
        <ellipse cx="148" cy="146" rx="8" ry="12" fill={skin} /><ellipse cx="252" cy="146" rx="8" ry="12" fill={skin} />
        {/* Haare vorn */}
        {voice === "f" ? (
          <path d="M146 132 C 146 84, 192 70, 214 78 C 238 86, 258 104, 254 134 C 236 112, 214 100, 186 102 C 168 106, 156 118, 146 132 Z" fill={hair} />
        ) : (
          <path d="M150 124 C 148 86, 186 72, 210 76 C 238 80, 256 98, 250 126 C 244 108, 232 98, 214 96 C 190 94, 166 100, 150 124 Z" fill={hair} />
        )}
        {voice === "m" && <path d="M160 168 C 170 204, 230 204, 240 168 C 232 186, 168 186, 160 168 Z" fill={hair} opacity=".35" />}
        {/* Augenbrauen und Augen (blinzeln) */}
        <path d="M168 122 Q 180 116 192 121" stroke={hair} strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M208 121 Q 220 116 232 122" stroke={hair} strokeWidth="4" fill="none" strokeLinecap="round" />
        <g className="origin-center [animation:blink_4.2s_infinite]" style={{ transformBox: "fill-box" }}>
          <ellipse cx="180" cy="138" rx="6" ry="6.5" fill="#2a2320" /><circle cx="182" cy="136" r="1.6" fill="#fff" />
          <ellipse cx="220" cy="138" rx="6" ry="6.5" fill="#2a2320" /><circle cx="222" cy="136" r="1.6" fill="#fff" />
        </g>
        {/* Nase, Wangen, Mund */}
        <path d="M200 142 Q 196 160 202 164" stroke="#b07d5e" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <circle cx="168" cy="162" r="8" fill="#e08f7a" opacity=".25" /><circle cx="232" cy="162" r="8" fill="#e08f7a" opacity=".25" />
        {speaking || open > 0.04 ? (
          <ellipse cx="200" cy="178" rx={10 + open * 2} ry={mouthRy} fill="#7a3b33" />
        ) : (
          <path d="M187 176 Q 200 186 213 176" stroke="#9a4a40" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        )}
      </g>
      <style>{`@keyframes blink { 0%, 92%, 100% { transform: scaleY(1) } 95% { transform: scaleY(0.1) } }`}</style>
    </svg>
  );
}
