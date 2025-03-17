import { useEffect, useState, useRef } from "react";
import useWindowDimensions from "./useWindowDimensions";
import sendEvent from "./utils/sendEvent";
import NextImage from "next/image";

const AD_REFRESH_MS = 30000; // refresh ad every 60 seconds

function findAdType(screenW, screenH, types, vertThresh) {
  let type = 0;
  for (let i = 0; i < types.length; i++) {
    if (types[i][0] <= screenW * 0.9 && types[i][1] <= screenH * vertThresh) {
      type = i;
    }
  }

  if (types[type][0] > screenW || types[type][1] > screenH * vertThresh)
    return -1;

  return type;
}

export default function Ad({
  types,
  centerOnOverflow,
  inCrazyGames,
  vertThresh = 0.3,
  screenW,
  screenH,
  showAdvertisementText = true,
}) {
  const [type, setType] = useState(
    findAdType(screenW, screenH, types, vertThresh)
  );
  const [isClient, setIsClient] = useState(false);
  const adDivRef = useRef(null);
  const lastRefresh = useRef(0);

  useEffect(() => {
    if (window.location.hostname === "localhost") setIsClient("debug");
    else setIsClient(true);
  }, []);

  useEffect(() => {
    setType(findAdType(screenW, screenH, types, vertThresh));
  }, [screenW, screenH, JSON.stringify(types), vertThresh]);

  useEffect(() => {
    lastRefresh.current = 0;
  }, [type]);

  useEffect(() => {


    const windowAny = window;

    const displayNewAd = () => {
    if(isClient === "debug" || !isClient) return;
    console.log("Displaying new ad", type, isClient);

      if (type === -1) return;
      setTimeout(() => {
        const isAdDivVisible =
        adDivRef.current &&
          adDivRef.current.getBoundingClientRect().top < window.innerHeight &&
          adDivRef.current.getBoundingClientRect().bottom > 0;
        if (
          (inCrazyGames || ( windowAny.aiptag && windowAny.aiptag.cmd && windowAny.aiptag.cmd.display)) &&
          isAdDivVisible &&
          Date.now() - lastRefresh.current > (AD_REFRESH_MS*(inCrazyGames?2:1))
        ) {
          if(!inCrazyGames) {
          try {
            if (windowAny.aipDisplayTag && windowAny.aipDisplayTag.clear) {
              for (const type of types) {
                windowAny.aipDisplayTag.clear(
                  `worldguessr-com_${type[0]}x${type[1]}`
                );
              }
            }
          } catch (e) {
            alert("error clearing ad");
          }
        } else {
          // clear everything inside the div
          document.getElementById(`worldguessr-com_${types[type][0]}x${types[type][1]}`).innerHTML = "";
        }

          lastRefresh.current = Date.now();
          sendEvent(`ad_request_${types[type][0]}x${types[type][1]}`);
          setTimeout(() => {
            if(!inCrazyGames) {
          windowAny.aiptag.cmd.display.push(function () {
            windowAny.aipDisplayTag.display(
              `worldguessr-com_${types[type][0]}x${types[type][1]}`
            );
          });
        } else {
            // await is not mandatory when requesting banners, but it will allow you to catch errors

            // check if
            function requestCrazyGamesBanner() {
          try {

            window.CrazyGames.SDK.banner.requestBanner({
              id: `worldguessr-com_${types[type][0]}x${types[type][1]}`,
              width: types[type][0],
              height: types[type][1],
            }).then((e) => {
              console.log("Banner request success", e);
                  // clear everything inside the div
          // document.getElementById(`worldguessr-com_${types[type][0]}x${types[type][1]}`).innerHTML = "";

            }).catch((e) => {
              console.log("Banner request error", e);
              document.getElementById(`worldguessr-com_${types[type][0]}x${types[type][1]}`).innerHTML = `
              <img src='/ad_${types[type][0]}x${types[type][1]}.png' width='${types[type][0]}' height='${types[type][1]}' alt='Advertisement' />`;

            });

          } catch (e) {
            console.log("Banner request error", e);
            if(e.code === "sdkNotInitialized") {
              console.log("SDK not initialized, retrying in 1s");
              setTimeout(() => {
                requestCrazyGamesBanner();
              }, 1000);
            }
          }
          }
          requestCrazyGamesBanner();

        }
        }, 50);
        }
      }, 100);
    };

    let timerId = setInterval(() => {
      displayNewAd();
    }, 1000);
    displayNewAd();
    return () => clearInterval(timerId);
  }, [type, inCrazyGames, isClient]);

  if (type === -1) return null;
  if (!isClient) return null;

  return (
    <div
      style={{
        position: "relative",
        display: "inline-block",
      }}
    >
      {showAdvertisementText && (
        <span
          style={{
            position: "absolute",
            top: "-24px",
            left: "0px",
            padding: "0 5px",
            fontSize: "18px",
            fontWeight: "bold",
          }}
        >
          Advertisement
        </span>
      )}
      <div
        style={{
          backgroundColor: "rgba(0,0,0,0.5)",
          height: types[type][1],
          width: types[type][0],
          textAlign: "center",
          position: "relative",
        }}
        id={`worldguessr-com_${types[type][0]}x${types[type][1]}`}
        ref={adDivRef}
      >
        {isClient === "debug" ? (
          <>
            <div style={{ position: "relative", zIndex: 1 }}>
              {/* <NextImage.default
                alt="Advertisement"
                src={`./ad_${types[type][0]}x${types[type][1]}.png`}
                width={types[type][0]}
                height={types[type][1]}
              /> */}
            </div>

            <div
              style={{
                position: "absolute",
                bottom: "10px",
                left: "0",
                width: "100%",
                color: "white",
                zIndex: 2,
                backgroundColor: "rgba(0, 0, 0, 0.5)",
              }}
            >
              <h3>Banner Ad Here (Adinplay)</h3>
              <p style={{ fontSize: "0.8em" }}>
                Ad size: {types[type][0]} x {types[type][1]}
              </p>
            </div>
          </>
        ) : (
          <>
            <div style={{ position: "relative", zIndex: 1 }}>
            {/* <NextImage.default
              alt="Advertisement"
              src={`./ad_${types[type][0]}x${types[type][1]}.png`}
              width={types[type][0]}
              height={types[type][1]}
            /> */}
            </div>

          </>
        )}
      </div>
    </div>
  );
}