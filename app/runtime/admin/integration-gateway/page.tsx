import RuntimeAdminClient from "@/components/admin/RuntimeAdminClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Integration Gateway · GuardianOS" };

/* Deliberately a thin route onto the SHARED Integration Gateway console rather
 * than a bespoke page. Gmail provisioning, validation, rotation and revocation
 * all live in components/admin/IntegrationGatewayPanel alongside Bedrock and
 * the generic connectors, so there is exactly one Gmail administration path. */
export default function IntegrationGatewayRoute() {
  return <RuntimeAdminClient initialTab="integrations" />;
}
