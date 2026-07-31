import Link from "next/link";

type Props = {
  title: string;
  value: string | number;
  subtitle?: string;
  href?: string;
};

export default function StatCard({
  title,
  value,
  subtitle,
  href,
}: Props) {
  const content = (
    <>
      <p className="text-sm font-medium text-slate-500">
        {title}
      </p>

      <h2 className="mt-3 text-3xl font-bold text-slate-900">
        {typeof value === "number"
          ? value.toLocaleString()
          : value}
      </h2>

      {subtitle && (
        <p className="mt-2 text-sm text-slate-500">
          {subtitle}
        </p>
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block cursor-pointer rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#860132]/40 hover:shadow-md"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {content}
    </div>
  );
}
