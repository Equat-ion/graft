import { ProjectDashboard } from "@/components/ProjectDashboard";

export default async function OrgProjectDashboardPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string }>;
}) {
  const { slug, projectId } = await params;
  return <ProjectDashboard projectId={projectId} orgSlug={slug} />;
}
