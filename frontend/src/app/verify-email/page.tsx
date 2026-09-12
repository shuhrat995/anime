"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "../auth-context";
import { ApiError } from "@/lib/api";

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const { ready, user, verifyEmail, resendVerification } = useAuth();
  const tokenFromUrl = searchParams.get("token") ?? "";
  const [manualToken, setManualToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [resent, setResent] = useState(false);

  const activeToken = tokenFromUrl || manualToken;
  const shouldAutoVerify = Boolean(tokenFromUrl) && !done && !busy && !error;

  useEffect(() => {
    if (!shouldAutoVerify) return;
    let cancelled = false;
    void verifyEmail(tokenFromUrl)
      .then(() => { if (!cancelled) setDone(true); })
      .catch((verifyError: unknown) => {
        if (!cancelled) setError(verifyError instanceof ApiError ? verifyError.message : "Kutilmagan xatolik yuz berdi.");
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per URL token
  }, [shouldAutoVerify, tokenFromUrl]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await verifyEmail(manualToken.trim());
      setDone(true);
    } catch (verifyError) {
      setError(verifyError instanceof ApiError ? verifyError.message : "Kutilmagan xatolik yuz berdi.");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setResent(false);
    try {
      await resendVerification();
      setResent(true);
    } catch (resendError) {
      setError(resendError instanceof ApiError ? resendError.message : "Kutilmagan xatolik yuz berdi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="account-layout">
      <div className="account-intro">
        <p className="eyebrow">Email tasdiqlash</p>
        <h1>Emailingizni tasdiqlang</h1>
        <p>
          Registratsiya paytida server konsoliga chiqarilgan tasdiqlash havolasini oching yoki tokenni
          qo‘lda kiriting. Development rejimida havola backend terminalida ko‘rinadi.
        </p>
      </div>
      <div className="account-stack">
        {done ? (
          <div className="account-card">
            <h2>✅ Email tasdiqlandi</h2>
            <p>Endi barcha imkoniyatlardan foydalanishingiz mumkin.</p>
            <Link className="primary-action" href={user ? "/account" : "/login"}>
              Davom etish
            </Link>
          </div>
        ) : (
          <form className="account-card" onSubmit={(event) => void submit(event)}>
            <h2>Tasdiqlash kodi</h2>
            <label>
              Token
              <input
                disabled={Boolean(tokenFromUrl)}
                onChange={(event) => setManualToken(event.target.value)}
                placeholder="64 belgili token"
                required
                value={activeToken}
              />
            </label>
            <button className="primary-action" disabled={busy || activeToken.trim().length !== 64} type="submit">
              {busy ? "Tekshirilmoqda..." : "Tasdiqlash"}
            </button>
            {error && <p className="inline-status" role="alert">{error}</p>}
            {resent && <p className="inline-status" role="status">Yangi havola server konsoliga chiqarildi.</p>}
          </form>
        )}
        {user && !user.emailVerified && !done && (
          <button className="secondary-action" disabled={busy} onClick={() => void resend()} type="button">
            Havolani qayta yuborish
          </button>
        )}
        {!ready && <p className="muted">Yuklanmoqda...</p>}
      </div>
    </section>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<main style={{ padding: "2rem" }}>Yuklanmoqda...</main>}>
      <VerifyEmailInner />
    </Suspense>
  );
}
