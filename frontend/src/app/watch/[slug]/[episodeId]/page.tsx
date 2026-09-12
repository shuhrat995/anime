import { WatchView } from "../../../zenith-app";

export default async function WatchEpisodePage({
  params,
}: {
  params: Promise<{ slug: string; episodeId: string }>;
}) {
  const { slug, episodeId } = await params;
  return <WatchView episodeId={episodeId} slug={slug} />;
}
