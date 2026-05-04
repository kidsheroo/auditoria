const LogoSVG = () => (
  <img src="/logo.png" width={54} height={54} style={{ objectFit: "contain" }} />
);

const GoogleIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24">
    <path fill="white" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="white" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="white" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="white" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const PREVIEW_ENTITIES = [
  { label: "Keywords",     count: 22, cost: "$8,240", color: "#ff2e6a" },
  { label: "Search Terms", count: 15, cost: "$6,180", color: "#f97316" },
  { label: "Ad Groups",    count: 7,  cost: "$2,800", color: "#a855f7" },
  { label: "Ads",          count: 3,  cost: "$1,200", color: "#0284c7" },
];

export default function ConnectScreen() {
  return (
    <div className="h-full flex" style={{ background: "#f0fdf9" }}>
      {/* Left panel */}
      <div className="flex flex-col justify-center" style={{ width: 580, padding: "64px 72px" }}>
        {/* Logo */}
        <div className="flex items-center gap-3 mb-16">
          <LogoSVG />
          <span className="text-[30px] font-semibold text-gray-800">Auditoria</span>
        </div>

        <div className="text-[16px] font-semibold uppercase tracking-[1px] mb-5" style={{ color: "#22c55e" }}>
          Stop wasting ad spend
        </div>

        <h1 className="text-[58px] font-bold leading-[1.1] text-gray-800 mb-6">
          Find your<br />
          <span className="gradient-text">Google Ads waste</span><br />
          in minutes.
        </h1>

        <p className="text-[18px] leading-[1.7] text-gray-500 mb-12" style={{ maxWidth: 460 }}>
          Auditoria connects to your Google Ads account, runs a full audit automatically,
          and surfaces exactly where your budget is leaking — with prioritized fixes.
        </p>

        <button
          onClick={() => { window.location.href = `${import.meta.env.VITE_API_URL ?? "http://localhost:8000"}/auth/login`; }}
          className="flex items-center gap-4 rounded-[18px] text-white font-semibold text-[18px] cursor-pointer transition-opacity hover:opacity-90"
          style={{
            background: "linear-gradient(135deg, #22c55e, #06b6d4)",
            padding: "18px 36px",
            width: "fit-content",
            boxShadow: "0 4px 24px rgba(34,197,94,0.35)",
            border: "none",
          }}
        >
          <GoogleIcon />
          Connect Google Ads
        </button>

        <p className="text-[13px] text-gray-400 mt-6">
          🔒 Read-only OAuth — we never modify your campaigns
        </p>
      </div>

      {/* Right panel — preview card */}
      <div className="flex-1 flex items-center justify-center">
        <div className="relative" style={{ padding: "32px 72px 48px 56px" }}>
          {/* Main preview card */}
          <div
            className="glass rounded-3xl overflow-hidden"
            style={{
              width: 510,
              transform: "rotate(1.5deg)",
              boxShadow: "0 24px 80px rgba(34,197,94,0.15)",
            }}
          >
            <div className="p-8 pb-5">
              <div className="text-[15px] text-gray-400 mb-2">Total Wasted Spend</div>
              <div className="gradient-text font-bold leading-none mb-2" style={{ fontSize: 60 }}>$18,420</div>
              <div className="text-[15px] text-gray-400">across 47 wasting entities</div>
            </div>
            <div style={{ height: 1, background: "#e5e7eb" }} />
            <div className="p-6 flex flex-col gap-4">
              {PREVIEW_ENTITIES.map((e) => (
                <div key={e.label} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: e.color }} />
                  <div className="flex-1 text-[16px] text-gray-800">{e.label}</div>
                  <div className="text-[14px] text-gray-400">{e.count} items</div>
                  <div className="text-[16px] font-semibold" style={{ color: e.color }}>{e.cost}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick wins badge — top-right edge */}
          <div
            className="absolute"
            style={{
              top: 16, right: 8,
              background: "rgba(255,46,106,0.08)",
              border: "1px solid rgba(255,46,106,0.2)",
              borderRadius: 16,
              padding: "10px 18px",
              transform: "rotate(-2deg)",
            }}
          >
            <div className="text-[13px] font-semibold" style={{ color: "#ff2e6a" }}>
              ⚡ 12 Quick Wins found
            </div>
          </div>

          {/* Audit complete badge — bottom-left edge */}
          <div
            className="absolute"
            style={{
              bottom: 16, left: 8,
              background: "rgba(34,197,94,0.08)",
              border: "1px solid rgba(34,197,94,0.2)",
              borderRadius: 16,
              padding: "10px 18px",
              transform: "rotate(1deg)",
            }}
          >
            <div className="text-[13px] font-semibold" style={{ color: "#22c55e" }}>
              ✓ Audit complete in 8s
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
