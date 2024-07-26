import { useEffect, useState, useRef } from "react"
import useWindowDimensions from "./useWindowDimensions";
import sendEvent from "./utils/sendEvent";

const AD_REFRESH_MS = 60000 // refresh ad every 60 seconds

function findAdType(screenW, screenH, types, vertThresh) {
  let type = 0
  for (let i = 0; i < types.length; i++) {
    if (types[i][0] <= screenW * 0.9 && types[i][1] <= screenH * vertThresh) {
      type = i
    }
  }

  if (types[type][0] > screenW || types[type][1] > screenH * vertThresh)
    return -1

  return type
}

export default function Ad({
  types,
  centerOnOverflow,
  vertThresh = 0.3,
  screenW,
  screenH
}) {
  // just a div for now with optimal ad size, null if none are good
  const [type, setType] = useState(
    findAdType(screenW, screenH, types, vertThresh)
  )
  const [isClient, setIsClient] = useState(false)
  const adDivRef = useRef(null)
  const lastRefresh = useRef(0)

  useEffect(() => {
    if(window.location.hostname === "localhost") setIsClient("debug")
    else setIsClient(true)
  }, [])

  useEffect(() => {
    setType(findAdType(screenW, screenH, types, vertThresh))
  }, [screenW, screenH, types, vertThresh])

  useEffect(() => {
    lastRefresh.current = 0;
  }, [type])

  useEffect(() => {
    const windowAny = window
    // clear ads
    const displayNewAd = () => {
      try {
        if (windowAny.aipDisplayTag && windowAny.aipDisplayTag.clear) {
          for (const type of types) {
            windowAny.aipDisplayTag.clear(
              `worldguessr-com_${type[0]}x${type[1]}`
            )
          }
        }
      } catch (e) {
        alert("error clearing ad")
      }
      if (type === -1) return
      setTimeout(() => {
        const isAdDivVisible = adDivRef.current.getBoundingClientRect().top < window.innerHeight && adDivRef.current.getBoundingClientRect().bottom > 0;
      if (
        windowAny.aiptag &&
        windowAny.aiptag.cmd &&
        windowAny.aiptag.cmd.display &&
        isAdDivVisible &&
        (Date.now() - lastRefresh.current) > AD_REFRESH_MS
      ) {

        lastRefresh.current = Date.now()
        sendEvent(`ad_request_${types[type][0]}x${types[type][1]}`)

        windowAny.aiptag.cmd.display.push(function() {
          windowAny.aipDisplayTag.display(
            `worldguessr-com_${types[type][0]}x${types[type][1]}`
          )
        })

      } else {
        // log why
        // if(!windowAny.aiptag || !windowAny.aiptag.cmd || !windowAny.aiptag.cmd.display) {
        //   console.log("aiptag not found")
        // }
        // if(!isAdDivVisible) {
        //   console.log("ad div not visible")
        // }
        // if((Date.now() - lastRefresh.current) < AD_REFRESH_MS) {
        //   console.log("too soon to refresh")
        // }
      }
    }, 100)

    }

    let timerId = setInterval(() => {
      displayNewAd()
    }, 1000)
    displayNewAd()
    return () => clearInterval(timerId)
  }, [type])

  if (type === -1) return null
  if(!isClient) return null
  // if((window as any).adProvider === "gamemonetize") return null;

  return (
    <div
      style={{
        backgroundColor: (isClient==="debug") ? "gray" : undefined,
        height: types[type][1],
        width: types[type][0],
        textAlign: "center",
        // transform:
        //   centerOnOverflow && centerOnOverflow < types[type][0]
        //     ? `translateX(calc(-1 * (${types[type][0]}px - ${centerOnOverflow}px) / 2))`
        //     : undefined
      }}
      id={`worldguessr-com_${types[type][0]}x${types[type][1]}`}
      ref={adDivRef}
    >
      {isClient==="debug" && (
        <>
          <h3>Banner Ad Here</h3>
          <p>
            Ad size: {types[type][0]} x {types[type][1]}
          </p>
        </>
      )}
    </div>
  )
}
