import Sidebar from "@/components/Sidebar";
import { supabase } from "@/lib/supabase";
import ResourceForm from "@/components/ResourceForm";

export default async function EditResourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: resource, error } = await supabase
    .from("knowledge_resources")
    .select(
      `
      id,
      title,
      resource_type,
      summary,
      department,
      version,
      status,
      owner_name,
      estimated_minutes,
      content_html,
      file_url,
      external_url,
      active
      `
    )
    .eq("id", id)
    .single();

  if (error || !resource) {
    return (
      <main className="min-h-screen bg-slate-100 text-slate-900">
        <div className="flex min-h-screen">
          <Sidebar />
          <section className="flex-1 p-8">
            <div className="rounded-xl bg-white p-6 shadow">Resource not found.</div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar />

        <section className="flex-1">
          <header className="border-b border-slate-200 bg-white px-8 py-5">
            <p className="text-sm font-medium text-slate-500">Edit Resource</p>
            <h1 className="text-2xl font-bold">{resource.title}</h1>
          </header>

          <div className="p-8">
            <a
              href={`/operations/resources/${resource.id}`}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <span className="text-lg">←</span>
              Back to Resource
            </a>

            <div className="mt-6 rounded-xl bg-white p-6 shadow">
              <div className="mb-6">
                <h2 className="text-xl font-semibold">Edit Resource</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Update the content and metadata for this resource.
                </p>
              </div>

              <ResourceForm
                mode="edit"
                resource={resource}
                cancelHref={`/operations/resources/${resource.id}`}
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
