import { useCallback, useRef } from "react";
import { toast } from "react-toastify";
import config from "@/clientConfig";

export const useMapSearch = (session, setSearchResults, setSearchLoading) => {
    const timeoutRef = useRef(null);

    const handleSearch = useCallback(
        (term) => {
            // Clear any pending debounced search
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }

            if (term.length > 0 && !process.env.NEXT_PUBLIC_COOLMATH) {
                // Show loading immediately when user types enough characters
                if (setSearchLoading) setSearchLoading(true);

                timeoutRef.current = setTimeout(() => {
                    const apiUrl = window.cConfig?.apiUrl || config().apiUrl;
                    fetch(apiUrl + "/api/map/searchMap", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ query: term, secret: session?.token?.secret }),
                    })
                        .then((res) => res.json())
                        .then((data) => {
                            setSearchResults(data);
                            if (setSearchLoading) setSearchLoading(false);
                        })
                        .catch(() => {
                            toast.error("Failed to search maps");
                            if (setSearchLoading) setSearchLoading(false);
                        });
                }, 300);
            } else {
                setSearchResults([]);
                if (setSearchLoading) setSearchLoading(false);
            }
        },
        [session?.token?.secret, setSearchResults, setSearchLoading]
    );

    return { handleSearch };
};