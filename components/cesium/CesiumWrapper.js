"use client"
import dynamic from "next/dynamic"
import React from "react"

const CesiumDynamicComponent = dynamic(() => import("./CesiumComponent"), {
  ssr: false
})

export const CesiumWrapper = ({ className }) => {
  const [CesiumJs, setCesiumJs] = React.useState(null)

  React.useEffect(() => {
    if (CesiumJs !== null) return
    const CesiumImportPromise = import("cesium")
    Promise.all([CesiumImportPromise]).then(promiseResults => {
      const { ...Cesium } = promiseResults[0]
      setCesiumJs(Cesium)
    })
  }, [CesiumJs])

  return CesiumJs ? (
    <CesiumDynamicComponent CesiumJs={CesiumJs} className={className} />
  ) : null
}

export default CesiumWrapper
