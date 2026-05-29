export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="eyebrow">
      <span className="h-1 w-1 rounded-full bg-forge-accent" />
      {children}
    </span>
  );
}
