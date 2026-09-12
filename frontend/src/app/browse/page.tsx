import { BrowseView } from "../zenith-app";

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; genre?: string }>;
}) {
  const { search = "", genre = "" } = await searchParams;
  // Remount BrowseView when the URL query changes so its editable fields re-seed from the new params.
  return <BrowseView key={`${search}|${genre}`} initialGenre={genre} initialSearch={search} />;
}
