import { useEffect, useRef, useState } from "react";
import { FaApple, FaGoogle, FaTimes } from "react-icons/fa";
import { NATIVE_AUTH_SHEET_EVENT, signIn } from "@/components/auth/auth";
import sendEvent from "@/components/utils/sendEvent";

const AUTH_SHEET_CLOSE_MS = 220;

function getNativePlatform() {
  if (typeof window === "undefined") return null;
  const capacitor = window.Capacitor;
  if (!capacitor?.isNativePlatform?.()) return null;
  return capacitor.getPlatform?.() || "native";
}

export default function NativeAuthSheet() {
  const [nativePlatform, setNativePlatform] = useState(null);
  const [authSheetOpen, setAuthSheetOpen] = useState(false);
  const [authSheetClosing, setAuthSheetClosing] = useState(false);
  const [loginPending, setLoginPending] = useState(false);
  const closeTimerRef = useRef(null);

  useEffect(() => {
    setNativePlatform(getNativePlatform());
  }, []);

  useEffect(() => {
    const openAuthSheet = (event) => {
      const platform = getNativePlatform();
      if (!platform) return;

      event.preventDefault();
      setNativePlatform(platform);
      setAuthSheetClosing(false);
      setAuthSheetOpen(true);
    };

    window.addEventListener(NATIVE_AUTH_SHEET_EVENT, openAuthSheet);

    return () => {
      window.removeEventListener(NATIVE_AUTH_SHEET_EVENT, openAuthSheet);
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const closeAuthSheet = (afterClose) => {
    if (authSheetClosing) return;
    setAuthSheetClosing(true);

    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = window.setTimeout(() => {
      setAuthSheetOpen(false);
      setAuthSheetClosing(false);
      closeTimerRef.current = null;
      afterClose?.();
    }, AUTH_SHEET_CLOSE_MS);
  };

  const startProviderLogin = (provider) => {
    if (loginPending) return;
    setLoginPending(true);
    closeAuthSheet(async () => {
      try {
        sendEvent("login_attempt");
        await signIn(provider, { forceProvider: true });
      } finally {
        setLoginPending(false);
      }
    });
  };

  if (!nativePlatform || !authSheetOpen) return null;

  return (
    <div
      className={`nativeAuthSheetBackdrop${authSheetClosing ? " nativeAuthSheetBackdrop--closing" : ""}`}
      onClick={() => closeAuthSheet()}
    >
      <div
        className={`nativeAuthSheet${authSheetClosing ? " nativeAuthSheet--closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Sign in"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="nativeAuthSheet__close" aria-label="Close" onClick={() => closeAuthSheet()}>
          <FaTimes />
        </button>
        <div className="nativeAuthSheet__header">
          <h2>Sign in to WorldGuessr</h2>
          <p>Sync progress, duels, friends, maps, and daily results.</p>
        </div>
        <div className="nativeAuthSheet__actions">
          {nativePlatform === "ios" && (
            <button
              className="nativeAuthSheet__provider nativeAuthSheet__provider--apple"
              disabled={loginPending}
              onClick={() => startProviderLogin("apple")}
            >
              <FaApple />
              <span>Continue with Apple</span>
            </button>
          )}
          <button
            className="nativeAuthSheet__provider nativeAuthSheet__provider--google"
            disabled={loginPending}
            onClick={() => startProviderLogin("google")}
          >
            <FaGoogle />
            <span>Continue with Google</span>
          </button>
        </div>
      </div>
    </div>
  );
}
