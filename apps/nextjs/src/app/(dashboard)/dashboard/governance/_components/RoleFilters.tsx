"use client";

import { Search } from "lucide-react";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

interface RoleFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  niveauFilter: string;
  onNiveauFilterChange: (value: string) => void;
}

export function RoleFilters({
  search,
  onSearchChange,
  niveauFilter,
  onNiveauFilterChange,
}: RoleFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher un rôle..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>
      <Select value={niveauFilter} onValueChange={onNiveauFilterChange}>
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue placeholder="Niveau" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Niveau 1</SelectItem>
          <SelectItem value="2">Niveau 2</SelectItem>
          <SelectItem value="3">Niveau 3</SelectItem>
          <SelectItem value="4">Niveau 4</SelectItem>
          <SelectItem value="5">Niveau 5</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
