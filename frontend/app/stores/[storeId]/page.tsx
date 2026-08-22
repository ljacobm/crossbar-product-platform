import { redirect } from "next/navigation";

export default async function StoreWorkspaceIndexPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  redirect(`/stores/${storeId}/overview`);
}
