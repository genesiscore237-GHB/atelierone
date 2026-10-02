import { GarageNav } from "./_components/GarageNav";

export default function GarageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <GarageNav />
      <div className="mt-6">
        {children}
      </div>
    </div>
  );
}