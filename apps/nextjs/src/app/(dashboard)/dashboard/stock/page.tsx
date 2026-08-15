import { DomainHub } from "~/components/module/DomainHub";
import { findDomain } from "~/lib/app-nav";

export const dynamic = "force-dynamic";

export default function StockHubPage() {
  const domain = findDomain("stock");
  if (!domain) return null;
  return <DomainHub domainId="stock" />;
}

