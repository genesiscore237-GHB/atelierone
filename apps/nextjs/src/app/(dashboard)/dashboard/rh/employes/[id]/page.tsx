import { EmployeeDetail } from "../../_components/EmployeeDetail";

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EmployeeDetail employeeId={id} />;
}