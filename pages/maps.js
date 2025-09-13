// pages/maps.js
import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import MapView from "@/components/maps/mapView";
import { useTranslation } from '@/components/useTranslations'
import config from "@/clientConfig";

import { useSession } from "@/components/auth/auth";
import Head from "next/head";

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

export default function MapsPage({  }) {
    const router = useRouter();
    const { t: text } = useTranslation("common");
    const { data: session, status } = useSession();
    const [makeMap, setMakeMap] = useState(initMakeMap);
    const [searchTerm, setSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState([]);

    useEffect(() => {
        window.cConfig = config();
    }, []);

    const handleMapClick = (map) => {
            router.push(`/map?s=${map.slug}`);
    };

    return (
        <div style={styles.pageContainer}>
          <Head>
<link href="https://fonts.googleapis.com/css2?family=Jockey+One&display=swap" rel="stylesheet"/>

          </Head>
            <div style={styles.pageContent}>
                <MapView
                    showOptions={false}
                    showAllCountriesOption={false}
                    chosenMap={undefined}
                    close={() => router.back()} // Use router.back() to go back on close
                    session={session}
                    text={text}
                    onMapClick={handleMapClick}
                    gameOptions={undefined}
                    setGameOptions={undefined}
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
    pageContainer: {
        width: "100vw",
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "linear-gradient(135deg, rgba(0, 0, 0, 0.98) 0%, rgba(0, 10, 5, 0.95) 50%, rgba(0, 0, 0, 0.98) 100%)",
    },
    pageContent: {
        background: "linear-gradient(135deg, rgba(5, 15, 8, 0.98) 0%, rgba(2, 8, 4, 0.99) 100%)",
        width: "calc(100vw - 40px)",
        height: "100vh",
        overflowY: "auto",
        borderRadius: "8px",
        padding: "20px",
        position: "relative",
    },
};

