import Home from "@/components/home";
import { useEffect } from "react";

export default function LocalizedHome({ path }) {

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_GAMEDISTRIBUTION === "true") return;
    if (typeof window === "undefined") return;

    if (path !== "auto") {
      // Explicit language page (e.g. /es, /fr) — URL is the source of truth
      try { window.localStorage.setItem("lang", path); } catch(e) {}
    }
    // path === "auto" (index page) — no redirect, useTranslation reads localStorage
  }, []);

  return <Home />;
}


