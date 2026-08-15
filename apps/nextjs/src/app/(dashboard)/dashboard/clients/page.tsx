import { DomainHub } from "~/components/module/DomainHub";
import { findDomain } from "~/lib/app-nav";

export const dynamic = "force-dynamic";

export default function ClientsHubPage() {
  const domain = findDomain("clients");
  if (!domain) return null;
  return <DomainHub domainId="clients" />;
}

