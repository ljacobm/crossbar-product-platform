import { redirect } from "next/navigation";

export default async function LegacyNewProductResourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/operations/resources/new?productId=${id}`);
}
