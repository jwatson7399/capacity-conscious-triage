export default function EvidenceWalkthrough({ onBack, darkMode }: { onBack: () => void; darkMode: boolean }) {
  const src = `${import.meta.env.BASE_URL}walkthrough-v4.html?dark=${darkMode ? '1' : '0'}&embedded=1`;
  return (
    <div className="fixed inset-0 z-40 bg-white dark:bg-slate-900">
      <button
        onClick={onBack}
        className="fixed top-3 left-3 z-50 bg-slate-900 text-white dark:bg-white dark:text-slate-900 rounded-full px-4 py-2 text-sm font-semibold shadow-lg active:scale-95 transition-transform"
        aria-label="Back"
      >
        ← Back
      </button>
      <iframe
        src={src}
        title="Evidence walkthrough"
        className="w-full h-full border-0"
      />
    </div>
  );
}
