import { StockNav } from "./_components/StockNav";

export default function StockLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <StockNav />
      <div className="mt-6">
        {children}
      </div>
    </div>
  );
}
