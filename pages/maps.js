// pages/maps.js
import React, { useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import MapView from "@/components/maps/mapView";
import { useTranslation } from '@/components/useTranslations'
import { asset } from '@/lib/basePath';

import { useSession } from "@/components/auth/auth";

const initMakeMap = {
    open: false,
    progress: false,
    name: "",
    description_short: "",
    description_long: "",
    data: "",
    edit: false,
    mapId: "",
};

// Platform builds (Poki/CoolMath/GD/SchoolGuessr) export this page on other
// origins, so worldguessr.com SEO tags stay off those.
const isMainSite = process.env.NEXT_PUBLIC_POKI !== "true" &&
    process.env.NEXT_PUBLIC_COOLMATH !== "true" &&
    process.env.NEXT_PUBLIC_GAMEDISTRIBUTION !== "true" &&
    process.env.NEXT_PUBLIC_SCHOOLGUESSR !== "true";

export default function MapsPage({ }) {
    const router = useRouter();
    const { t: text } = useTranslation("common");
    const { data: session } = useSession();
    const [makeMap, setMakeMap] = useState(initMakeMap);
    const [searchTerm, setSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState([]);

    return (
        <div style={styles.page}>
            <Head>
                <title>{`${text("communityMaps")} - WorldGuessr`}</title>
                <meta name="description" content="Browse community-made maps for WorldGuessr, a free GeoGuessr alternative. Play countries, cities and themed challenges, or create your own map." />
                {isMainSite && <link rel="canonical" href="https://www.worldguessr.com/maps" />}
                <link rel="icon" type="image/x-icon" href={asset("/icon.ico")} />
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
            </Head>
            {/* body::before (street2.webp over black) supplies the backdrop —
                the same one the home screen and maps modal sit on. MapView
                draws its own glass panel, so the page adds no shell of its
                own: just the single scroll container (outer-only scroll, iOS). */}
            <div style={styles.scroll}>
                <MapView
                    showOptions={false}
                    showAllCountriesOption={false}
                    close={() => router.push("/")}
                    closeLabel={text("backToGame")}
                    session={session}
                    text={text}
                    onMapClick={(map) => router.push(`/map?s=${map.slug}`)}
                    makeMap={makeMap}
                    setMakeMap={setMakeMap}
                    initMakeMap={initMakeMap}
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    searchResults={searchResults}
                    setSearchResults={setSearchResults}
                />
            </div>
        </div>
    );
}

const styles = {
    // Fixed viewport shell instead of 100vh (mobile URL bars make vh lie),
    // mirroring the maps modal's fixed-container + single-scroll structure.
    page: {
        position: "fixed",
        inset: 0,
        overflow: "hidden",
    },
    scroll: {
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
        WebkitOverflowScrolling: "touch",
        overscrollBehavior: "contain",
        padding: "20px",
        boxSizing: "border-box",
    },
};
