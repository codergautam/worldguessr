"use client"
import React from "react"
//NOTE: It is important to assign types using "import type", not "import"
//NOTE: This is required to get the stylings for default Cesium UI and controls
import "cesium/Build/Cesium/Widgets/widgets.css"

export const CesiumComponent = ({ CesiumJs, className }) => {
  const cesiumViewer = React.useRef(null)
  const cesiumContainerRef = React.useRef(null)
  const addedScenePrimitives = React.useRef([])
  const [isLoaded, setIsLoaded] = React.useState(false)

  const resetCamera = React.useCallback(async () => {
    // Set the initial camera to look at Seattle


    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cleanUpPrimitives = React.useCallback(() => {
    //On NextJS 13.4+, React Strict Mode is on by default.
    //The block below will remove all added primitives from the scene.
    addedScenePrimitives.current.forEach(scenePrimitive => {
      if (cesiumViewer.current !== null) {
        cesiumViewer.current.scene.primitives.remove(scenePrimitive)
      }
    })
    addedScenePrimitives.current = []
  }, [])


  React.useEffect(() => {
    if (cesiumViewer.current === null && cesiumContainerRef.current) {
      //OPTIONAL: Assign access Token here
      //Guide: https://cesium.com/learn/ion/cesium-ion-access-tokens/
      CesiumJs.Ion.defaultAccessToken = `${process.env.NEXT_PUBLIC_CESIUM_TOKEN}`

      //NOTE: Always utilize CesiumJs; do not import them from "cesium"
      cesiumViewer.current = new CesiumJs.Viewer(cesiumContainerRef.current, {
        //Using the Sandcastle example below
        //https://sandcastle.cesium.com/?src=3D%20Tiles%20Feature%20Styling.html
        terrain: CesiumJs.Terrain.fromWorldTerrain()
      })

      // set min and max zoom
      cesiumViewer.current.scene.screenSpaceCameraController.minimumZoomDistance = 20000000.0
      cesiumViewer.current.scene.screenSpaceCameraController.maximumZoomDistance = 20000000.0
      // set current zoom to 50000000.0
      cesiumViewer.current.camera.setView({
        destination: CesiumJs.Cartesian3.fromDegrees(-122.3, 47.6, 20000000.0)
      })

      // remove stars and sun and atmosphere
      cesiumViewer.current.scene.skyBox.show = false
      cesiumViewer.current.scene.sun.show = false
      cesiumViewer.current.scene.moon.show = false

      // slowly turn the globe animation
      setInterval(() => {
        cesiumViewer.current.scene.camera.rotateRight(0.005)
      }, 10)

      cesiumViewer.current.scene.screenSpaceCameraController.enableRotate = true
      cesiumViewer.current.scene.screenSpaceCameraController.enableTranslate = false
      cesiumViewer.current.scene.screenSpaceCameraController.enableZoom = false
      cesiumViewer.current.scene.screenSpaceCameraController.enableTilt = false
      cesiumViewer.current.scene.screenSpaceCameraController.enableLook = false


      //NOTE: Example of configuring a Cesium viewer
      cesiumViewer.current.clock.clockStep =
        CesiumJs.ClockStep.SYSTEM_CLOCK_MULTIPLIER
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={cesiumContainerRef}
      id="cesium-container"
      // style={{ height: "100vh", width: "70vw", transform: "translateX(-15vw)"}}
      className={`cesium-container ${className}`}
    />
  )
}

export default CesiumComponent
