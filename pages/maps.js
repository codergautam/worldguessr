// pages/maps.js
import React from "react";
import { useRouter } from "next/router";
import MapView from "@/components/maps/mapView";
import { useTranslation } from '@/components/useTranslations'

export default function MapsPage({  }) {
    const router = useRouter();
    const { t: text } = useTranslation("common");
    const { data: session, status } = useSession();

    const handleMapClick = (map) => {
            router.push(`/map/${map.slug}`);
    };

    return (
        <div style={styles.pageContainer}>
          <Head>
<link href="https://fonts.googleapis.com/css2?family=Jockey+One&display=swap" rel="stylesheet"/>

          </Head>
            <div style={styles.pageContent}>
                <MapView
                    singleplayer={false}
                    showAllCountriesOption={false}
                    chosenMap={undefined}
                    close={() => router.back()} // Use router.back() to go back on close
                    session={session}
                    text={text}
                    onMapClick={handleMapClick}
                    gameOptions={undefined}
                    setGameOptions={undefined}
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
        backgroundColor: "#f0f0f0", // Adjust according to your design
    },
    pageContent: {
        backgroundColor: "#3A3B3C",
        width: "calc(100vw - 40px)",
        height: "100vh",
        overflowY: "auto",
        borderRadius: "8px",
        padding: "20px",
        position: "relative",
    },
};


import { useSession } from "next-auth/react";
import Head from "next/head";