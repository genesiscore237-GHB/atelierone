import { Skeleton } from "./skeleton";

interface Column {
  header: string;
  width: string;
}

interface TableSkeletonProps {
  rows?: number;
  columns?: Column[];
}

export function TableSkeleton({
  rows = 5,
  columns = [
    { header: "Name", width: "w-1/3" },
    { header: "Status", width: "w-1/6" },
    { header: "Amount", width: "w-1/6" },
    { header: "Date", width: "w-1/6" },
  ],
}: TableSkeletonProps) {
  return (
    <div className="space-y-3" data-slot="table-skeleton">
      <div className="flex items-center gap-4 border-b pb-3">
        {columns.map((col, i) => (
          <Skeleton key={i} className={`h-4 ${col.width}`} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} className="flex items-center gap-4 py-2">
          {columns.map((col, colIdx) => (
            <Skeleton key={colIdx} className={`h-4 ${col.width}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div
      className="space-y-4 rounded-xl border p-6"
      data-slot="card-skeleton"
    >
      <Skeleton className="aspect-video w-full rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24 rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
    </div>
  );
}

export function StatsCardSkeleton() {
  return (
    <div
      className="space-y-3 rounded-xl border p-5"
      data-slot="stats-card-skeleton"
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="size-8 rounded-full" />
      </div>
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}
