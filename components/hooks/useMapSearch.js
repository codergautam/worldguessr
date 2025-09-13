import { useCallback } from "react";
import { toast } from "react-toastify";
import config from "@/clientConfig";

const debounce = (func, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(null, args), delay);
    };
};

export const useMapSearch = (session, setSearchResults) => {
    const handleSearch = useCallback(
        debounce((term) => {
            if (term.length > 3 && !process.env.NEXT_PUBLIC_COOLMATH) {
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
                    })
                    .catch(() => {
                        toast.error("Failed to search maps");
                    });
            } else {
                setSearchResults([]);
            }
        }, 300),
        [session?.token?.secret, setSearchResults]
    );

    return { handleSearch };
};