// Double-bezel surface: outer shell (hairline + soft shadow) wrapping an inner
// core with a concentric smaller radius. The signature soft-premium card.
export function Bezel({
  children,
  className = "",
  tone = "panel",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "panel" | "ink";
}) {
  const inner =
    tone === "ink"
      ? "bg-forge-text text-forge-bg"
      : "bg-forge-panel text-forge-text";
  return (
    <div className="rounded-[2.25rem] bg-forge-shell p-1.5 shadow-soft ring-1 ring-black/[0.06]">
      <div className={`rounded-[1.875rem] ${inner} ${className}`}>{children}</div>
    </div>
  );
}
