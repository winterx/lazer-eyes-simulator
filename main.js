import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// DOM Elements
const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const debugCanvas = document.getElementsByClassName('debug_canvas')[0];
const debugCtx = debugCanvas.getContext('2d');
const debugBtn = document.getElementById('debugBtn');
const laserBtn = document.getElementById('laserBtn');

let isDebugMode = false;
let isLaserMode = true; // Default to on

debugBtn.addEventListener('click', () => {
    isDebugMode = !isDebugMode;
    debugBtn.textContent = isDebugMode ? "Hide Landmarks" : "Show Landmarks";
    if (!isDebugMode) {
        debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
    }
});

laserBtn.addEventListener('click', () => {
    isLaserMode = !isLaserMode;
    laserBtn.textContent = isLaserMode ? "Disable Lasers" : "Enable Lasers";
    // Update visibility immediately
    if (!isLaserMode) {
        lasers.forEach(l => l.visible = false);
    }
});

// Three.js Globals
let scene, camera, renderer, composer;
let lasers = []; // Array to hold the two laser meshes

function initThreeJS() {
    scene = new THREE.Scene();
    
    // Get container dimensions
    const container = document.querySelector('.container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    const aspect = width / height;
    camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
    camera.position.z = 5;

    renderer = new THREE.WebGLRenderer({
        canvas: canvasElement,
        alpha: true,
        antialias: true
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    // Important for post-processing with transparency
    renderer.setClearColor(0x000000, 1); // Opaque black, but background will cover it

    // Post-processing Setup
    const renderScene = new RenderPass(scene, camera);
    
    // Resolution, strength, radius, threshold
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        1.5, 0.4, 0.85
    );
    bloomPass.strength = 1.8; 
    bloomPass.radius = 0.15;
    bloomPass.threshold = 0.9; // Higher threshold to avoid blooming the video too much

    const outputPass = new OutputPass();

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);
    composer.addPass(outputPass);

    // Resize debug canvas
    debugCanvas.width = width;
    debugCanvas.height = height;

    // Video Background
    const videoTexture = new THREE.VideoTexture(videoElement);
    videoTexture.colorSpace = THREE.SRGBColorSpace;
    // Mirror the texture to match the mirrored CSS look (and our logic)
    videoTexture.center.set(0.5, 0.5);
    videoTexture.repeat.set(-1, 1); 
    scene.background = videoTexture;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Create Laser Eyes (Glowing Spheres)
    // We use a SphereGeometry with a red emissive material
    const sphereGeometry = new THREE.SphereGeometry(0.08, 32, 32); // Size of the eye glow
    // High intensity color for bloom
    const sphereMaterial = new THREE.MeshBasicMaterial({ 
        color: new THREE.Color(10, 0, 0), // High intensity red
        toneMapped: false,
        transparent: true,
        opacity: 0.5
    });
    // To make it really glow, we can use a higher color value if tone mapping allows, 
    // or just rely on the bloom pass with low threshold.
    // MeshBasicMaterial with 0xff0000 is pure red.
    
    // Let's add a core to the eye to make it look hotter in the center
    const coreGeometry = new THREE.SphereGeometry(0.04, 32, 32);
    const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });

    const leftEyeMesh = new THREE.Group();
    const leftGlow = new THREE.Mesh(sphereGeometry, sphereMaterial);
    const leftCore = new THREE.Mesh(coreGeometry, coreMaterial);
    leftEyeMesh.add(leftGlow);
    leftEyeMesh.add(leftCore);

    const rightEyeMesh = new THREE.Group();
    const rightGlow = new THREE.Mesh(sphereGeometry, sphereMaterial);
    const rightCore = new THREE.Mesh(coreGeometry, coreMaterial);
    rightEyeMesh.add(rightGlow);
    rightEyeMesh.add(rightCore);

    scene.add(leftEyeMesh);
    scene.add(rightEyeMesh);
    
    lasers = [leftEyeMesh, rightEyeMesh];
    
    // Initially hide
    lasers.forEach(l => l.visible = false);

    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
    const container = document.querySelector('.container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer.setSize(width, height);
    debugCanvas.width = width;
    debugCanvas.height = height;
}

function animate() {
    requestAnimationFrame(animate);
    if (isLaserMode) {
        composer.render();
    } else {
        renderer.render(scene, camera);
    }
}

// Initialize Three.js
initThreeJS();
animate();

// MediaPipe Setup
const faceMesh = new FaceMesh({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
}});

faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

faceMesh.onResults(onResults);

const cameraFeed = new Camera(videoElement, {
    onFrame: async () => {
        await faceMesh.send({image: videoElement});
    },
    width: 1280,
    height: 720
});
cameraFeed.start();

function onResults(results) {
    // Clear debug canvas
    debugCtx.save();
    debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
    
    // Mirror the context if we want to match the mirrored video
    // But drawing_utils usually expects standard coords.
    // The video element is CSS mirrored.
    // If we draw normally, it will look inverted relative to the mirrored video unless we also mirror the canvas.
    // Let's mirror the canvas context to match.
    debugCtx.translate(debugCanvas.width, 0);
    debugCtx.scale(-1, 1);

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        for (const landmarks of results.multiFaceLandmarks) {
            updateMask(landmarks);
            
            if (isDebugMode) {
                drawConnectors(debugCtx, landmarks, FACEMESH_TESSELATION,
                               {color: '#C0C0C070', lineWidth: 1});
                drawConnectors(debugCtx, landmarks, FACEMESH_RIGHT_EYE, {color: '#FF3030'});
                drawConnectors(debugCtx, landmarks, FACEMESH_RIGHT_EYEBROW, {color: '#FF3030'});
                drawConnectors(debugCtx, landmarks, FACEMESH_LEFT_EYE, {color: '#30FF30'});
                drawConnectors(debugCtx, landmarks, FACEMESH_LEFT_EYEBROW, {color: '#30FF30'});
                drawConnectors(debugCtx, landmarks, FACEMESH_FACE_OVAL, {color: '#E0E0E0'});
                drawConnectors(debugCtx, landmarks, FACEMESH_LIPS, {color: '#E0E0E0'});
            }
        }
    } else {
        lasers.forEach(l => l.visible = false);
    }
    debugCtx.restore();
}

function updateMask(landmarks) {
    // Landmark indices
    // Left Eye Center: 468 (Iris center if using refineLandmarks) or approx 159 (upper eyelid) / 145 (lower eyelid)
    // Right Eye Center: 473 (Iris) or approx 386 / 374
    // If refineLandmarks is true, we have iris landmarks:
    // Left Iris: 468-472
    // Right Iris: 473-477
    // Center of iris is 468 (Left) and 473 (Right)
    
    const leftEye = landmarks[468];
    const rightEye = landmarks[473];
    
    // Fallback if iris landmarks are missing (shouldn't happen with refineLandmarks: true)
    // const leftEye = landmarks[159]; 
    // const rightEye = landmarks[386];

    const nose = landmarks[1];
    const leftTemple = landmarks[234];
    const rightTemple = landmarks[454];
    const forehead = landmarks[10];
    const chin = landmarks[152];

    if (!leftEye || !rightEye || !nose || !leftTemple || !rightTemple || !forehead || !chin) return;

    // Helper to map MP coords to Three.js world coords
    const mapToWorld = (landmark) => {
        // See previous logic for mapping
        const baseDepth = 5;
        const vFOV = camera.fov * Math.PI / 180;
        const visibleHeight = 2 * Math.tan(vFOV / 2) * baseDepth;
        const visibleWidth = visibleHeight * camera.aspect;

        const x = -(landmark.x - 0.5) * visibleWidth;
        const y = -(landmark.y - 0.5) * visibleHeight;
        // We can use landmark.z to add some depth variation, but MP z is relative to face center usually.
        // Let's keep it simple at z=0 for the "face plane" or add a slight offset.
        // MP Z is roughly same scale as X.
        // Let's try to use Z for better rotation handling.
        // We need to scale Z similarly to X/Y.
        const z = -landmark.z * visibleWidth; // Approximate scale
        return new THREE.Vector3(x, y, z);
    };

    const leftEyePos = mapToWorld(leftEye);
    const rightEyePos = mapToWorld(rightEye);
    
    // Calculate Face Rotation
    const chinPos = mapToWorld(chin);
    const foreheadPos = mapToWorld(forehead);
    const leftTemplePos = mapToWorld(leftTemple);
    const rightTemplePos = mapToWorld(rightTemple);

    // Y axis: Chin to Forehead
    const yAxis = new THREE.Vector3().subVectors(foreheadPos, chinPos).normalize();
    // X axis: Left to Right Temple
    const xAxis = new THREE.Vector3().subVectors(rightTemplePos, leftTemplePos).normalize();
    // Z axis: Forward (Cross X and Y)
    const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
    // Re-orthogonalize Y
    yAxis.crossVectors(zAxis, xAxis).normalize();

    const rotationMatrix = new THREE.Matrix4();
    rotationMatrix.makeBasis(xAxis, yAxis, zAxis);
    const rotation = new THREE.Euler().setFromRotationMatrix(rotationMatrix);

    // Update Lasers
    if (lasers.length === 2) {
        if (isLaserMode) {
            // Left Laser
            lasers[0].visible = true;
            lasers[0].position.copy(leftEyePos);
            // lasers[0].setRotationFromEuler(rotation); // Spheres don't need rotation
            
            // Right Laser
            lasers[1].visible = true;
            lasers[1].position.copy(rightEyePos);
            // lasers[1].setRotationFromEuler(rotation);
        } else {
            lasers[0].visible = false;
            lasers[1].visible = false;
        }
    }
}

