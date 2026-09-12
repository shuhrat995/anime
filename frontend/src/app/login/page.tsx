import { AuthView } from "../zenith-app";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect = "/" } = await searchParams;
  return <AuthView mode="login" redirectTo={redirect} />;
}
