export default function SettingsPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="font-display text-2xl tracking-widest text-ink mb-1">SETTINGS</h1>
      <p className="text-[11px] text-ink-2">Budget limits, alert rules, notification preferences.</p>

      <div className="mt-6 bg-bg-2 border border-border rounded-lg p-6 text-center">
        <p className="text-ink-2 text-xs">Settings coming soon.</p>
        <p className="text-muted text-[11px] mt-1">
          For now, edit budget limits in <code className="text-cyan">SpendingPanel.tsx</code> and
          alert thresholds in <code className="text-cyan">AlertPanel.tsx</code>.
        </p>
      </div>
    </div>
  );
}