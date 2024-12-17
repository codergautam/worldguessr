import { useRef , useEffect } from "react";
import * as THREE from "three"

const Globe = () => {
    const globeRef = useRef();

    useEffect(() => {
        if (!globeRef.current) return;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(
            75,
            globeRef.current.clientWidth / globeRef.current.clientHeight,
            0.1,
            1000
        );
        camera.position.z = 4;

        const renderer = new THREE.WebGLRenderer();
        renderer.setSize(globeRef.current.clientWidth, globeRef.current.clientHeight);
        renderer.outputEncoding = THREE.sRGBEncoding; // Enable gamma correction
        globeRef.current.appendChild(renderer.domElement);

        const geometry = new THREE.SphereGeometry(2.6, 32, 32);
        const textureLoader = new THREE.TextureLoader();
        const earthTexture = textureLoader.load('/earthMap.jpg');
        earthTexture.anisotropy = 16;
        earthTexture.minFilter = THREE.LinearFilter;
        earthTexture.magFilter = THREE.LinearFilter;
        earthTexture.encoding = THREE.sRGBEncoding;

        const material = new THREE.MeshStandardMaterial({ map: earthTexture });
        const globe = new THREE.Mesh(geometry, material);
        scene.add(globe);

        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 5);
        scene.add(hemiLight);

        const animate = () => {
            requestAnimationFrame(animate);
            globe.rotation.y += 0.002;
            renderer.render(scene, camera);
        };
        animate();

        const handleResize = () => {
            renderer.setSize(globeRef.current.clientWidth, globeRef.current.clientHeight);
            camera.aspect = globeRef.current.clientWidth / globeRef.current.clientHeight;
            camera.updateProjectionMatrix();
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            renderer.dispose();
            globeRef.current.removeChild(renderer.domElement);
        };
    }, []);

    return (
        <div
            ref={globeRef}
            style={{ width: '100%', height: '100%', zIndex: 500 }}
            className="fixed top-0 right-0"
        ></div>
    );
};

export default Globe;
