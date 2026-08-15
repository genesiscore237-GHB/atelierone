import { DomainHub } from "~/components/module/DomainHub";
import { findDomain } from "~/lib/app-nav";

export const dynamic = "force-dynamic";

export default function FinanceHubPage() {
  const domain = findDomain("finance");
  if (!domain) return null;
  return <DomainHub domainId="finance" />;
}

