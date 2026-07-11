type PageHeaderProps = {
  title?: string;
  subtitle?: string;
};

export default function PageHeader({
  title = "Products",
  subtitle = "Manage catalog products, supplier data, variants, images, and website settings.",
}: PageHeaderProps) {
  return (
    <header className="border-b border-gray-200 bg-white px-8 py-5">
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="text-sm text-gray-500">{subtitle}</p>
    </header>
  );
}