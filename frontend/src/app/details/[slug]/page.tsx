import { DetailsView } from "../../zenith-app";

export default async function DetailsBySlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <DetailsView slug={slug} />;
}
