import { DomainHub } from "~/components/module/DomainHub";
import { findDomain } from "~/lib/app-nav";

export const dynamic = "force-dynamic";

export default function SitesHubPage() {
  const domain = findDomain("sites");
  if (!domain) return null;
  return <DomainHub domainId="sites" />;
}

