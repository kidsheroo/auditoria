export default function ConnectScreen() {
  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="glass rounded-3xl p-10 max-w-md w-full text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 text-white text-2xl font-bold shadow-lg"
          style={{ background: "linear-gradient(135deg, #7f7fd5, #86a8e7, #91eae4)" }}
        >
          A
        </div>
        <h1 className="text-2xl font-semibold text-gray-800 mb-2">Auditoria</h1>
        <p className="text-gray-400 text-sm mb-8 leading-relaxed">
          Connect your Google Ads account to audit campaigns, keywords,
          and creatives for wasted spend.
        </p>
        <button
          onClick={() => { window.location.href = "http://localhost:8000/auth/login"; }}
          className="btn-gradient w-full py-3 px-6 rounded-2xl text-sm font-medium shadow-md"
        >
          Connect Google Ads
        </button>
        <p className="text-xs text-gray-400 mt-4">
          You'll be redirected to Google to authorize access.
        </p>
      </div>
    </div>
  );
}
