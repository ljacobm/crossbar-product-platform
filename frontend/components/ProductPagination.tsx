import Link from "next/link";

function buildPageHref(
  basePath: string,
  params: Record<string, string | undefined>,
  page: number
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  if (page > 1) search.set("page", String(page));
  const qs = search.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export default function ProductPagination({
  basePath,
  page,
  total,
  pageSize,
  preservedParams,
}: {
  basePath: string;
  page: number;
  total: number;
  pageSize: number;
  preservedParams: Record<string, string | undefined>;
}) {
  if (total <= pageSize) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mt-4 flex items-center justify-between">
      {page > 1 ? (
        <Link
          href={buildPageHref(basePath, preservedParams, page - 1)}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ← Previous
        </Link>
      ) : (
        <span />
      )}

      <span className="text-sm text-slate-500">
        Page {page} of {totalPages}
      </span>

      {page < totalPages ? (
        <Link
          href={buildPageHref(basePath, preservedParams, page + 1)}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Next →
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}
