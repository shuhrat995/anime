import { AuthView } from "../zenith-app";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect = "/" } = await searchParams;
  return <AuthView mode="register" redirectTo={redirect} />;
}
