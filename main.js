import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GUI } from 'lil-gui';

// DOM Elements
const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const debugCanvas = document.getElementsByClassName('debug_canvas')[0];
const debugCtx = debugCanvas.getContext('2d');
// const debugBtn = document.getElementById('debugBtn'); // Removed
const laserBtn = document.getElementById('laserBtn');
const captureBtn = document.getElementById('captureBtn');

let isDebugMode = false;
let isLaserMode = true; // Default to on

// Settings object for GUI
const settings = {
    showLandmarks: false
};

let landmarksController; // To update display when shortcut is used

function toggleDebug() {
    isDebugMode = !isDebugMode;
    settings.showLandmarks = isDebugMode;
    if (landmarksController) landmarksController.updateDisplay();
    
    if (!isDebugMode) {
        debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
    }
}

function toggleLaser() {
    isLaserMode = !isLaserMode;
    laserBtn.style.backgroundColor = isLaserMode ? "rgba(255, 0, 0, 0.5)" : "rgba(0, 0, 0, 0.7)";
    
    if (!isLaserMode) {
        lasers.forEach(l => l.visible = false);
    }
}

function captureImage() {
    // We need to render one frame to ensure everything is up to date on the canvas
    // But `composer.render()` is called in the loop.
    // To capture, we can just take the canvas data.
    // However, `preserveDrawingBuffer` might be needed if the canvas is cleared automatically.
    // Let's try simply toDataURL first.
    
    // Note: The video background is a texture in WebGL, so it should be captured if we render the scene.
    // But we are using `scene.background = videoTexture`.
    
    // Force a render to make sure the buffer is populated for capture (if not in loop)
    if (isLaserMode) {
        composer.render();
    } else {
        renderer.render(scene, camera);
    }
    
    const dataURL = canvasElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'Lazer eyes.png';
    link.href = dataURL;
    link.click();
}

// debugBtn.addEventListener('click', toggleDebug); // Removed
laserBtn.addEventListener('click', toggleLaser);
captureBtn.addEventListener('click', captureImage);

// Keyboard Shortcuts
window.addEventListener('keydown', (event) => {
    // Ignore if typing in an input (though we don't have any)
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;

    switch(event.key.toLowerCase()) {
        case 'f':
            toggleDebug();
            break;
        case 'l':
            toggleLaser();
            break;
        case 'c':
            captureImage();
            break;
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
        antialias: true,
        preserveDrawingBuffer: true // Required for toDataURL to work reliably
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
    bloomPass.strength = 1.87; 
    bloomPass.radius = 0.15;
    bloomPass.threshold = 0.999; // Higher threshold to avoid blooming the video too much

    // Debug GUI
    const gui = new GUI();
    
    // General Settings
    const generalFolder = gui.addFolder('General');
    landmarksController = generalFolder.add(settings, 'showLandmarks').name('Show Landmarks').onChange((value) => {
        isDebugMode = value;
        if (!isDebugMode) {
            debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
        }
    });
    generalFolder.open();

    const bloomFolder = gui.addFolder('Bloom Settings');
    bloomFolder.add(bloomPass, 'strength', 0, 5).name('Strength');
    bloomFolder.add(bloomPass, 'radius', 0, 1).name('Radius');
    bloomFolder.add(bloomPass, 'threshold', 0, 1).name('Threshold');
    // bloomFolder.open();

    // Anamorphic Flare Shader
    const AnamorphicFlareShader = {
        uniforms: {
            'tDiffuse': { value: null },
            'strength': { value: 0.5 }, // Multiplier for the flare
            'threshold': { value: 0.9 }, // Brightness threshold
            'scale': { value: 1.0 }, // Horizontal spread scale
            'resolution': { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
            }
        `,
        fragmentShader: `
            uniform sampler2D tDiffuse;
            uniform float strength;
            uniform float threshold;
            uniform float scale;
            uniform vec2 resolution;
            varying vec2 vUv;

            void main() {
                vec4 texel = texture2D( tDiffuse, vUv );
                vec3 originalColor = texel.rgb;
                
                // Horizontal blur loop
                vec3 flare = vec3(0.0);
                float step = 1.0 / resolution.x * scale;
                
                // Sample horizontally
                // We'll take fewer samples with larger steps for performance/style
                for (float i = -10.0; i <= 10.0; i += 1.0) {
                    if (i == 0.0) continue;
                    
                    vec2 offset = vec2(i * step * 2.0, 0.0); // *2.0 to spread it out more
                    vec4 sampleCol = texture2D( tDiffuse, vUv + offset );
                    
                    // Check brightness
                    float brightness = max(sampleCol.r, max(sampleCol.g, sampleCol.b));
                    
                    if (brightness > threshold) {
                        // Distance attenuation
                        float weight = 1.0 / (abs(i) + 1.0);
                        flare += sampleCol.rgb * weight;
                    }
                }
                
                // Add flare to original
                gl_FragColor = vec4( originalColor + flare * strength, texel.a );
            }
        `
    };

    const flarePass = new ShaderPass(AnamorphicFlareShader);
    flarePass.uniforms['threshold'].value = 2; // Only pick up very bright things (lasers are > 1)
    flarePass.uniforms['strength'].value = 0.2;
    flarePass.uniforms['scale'].value = 3.8; // Spread it out

    const flareFolder = gui.addFolder('Anamorphic Flare');
    flareFolder.add(flarePass.uniforms['strength'], 'value', 0, 5).name('Strength');
    flareFolder.add(flarePass.uniforms['threshold'], 'value', 0, 2).name('Threshold');
    flareFolder.add(flarePass.uniforms['scale'], 'value', 0, 20).name('Spread');
    flareFolder.open();

    const outputPass = new OutputPass();

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);
    composer.addPass(flarePass); // Add flare after bloom (or before? After bloom means we flare the bloom too, which might be nice)
    // Actually, if we flare after bloom, we might flare the glow.
    // If we flare before bloom, bloom will glow the flare.
    // Let's try after bloom first to streak the glow.
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
    
    // Update flare resolution
    // We need to access flarePass here. It's not global.
    // Let's make it accessible or just iterate passes.
    const flarePass = composer.passes.find(p => p.uniforms && p.uniforms.resolution);
    if (flarePass) {
        flarePass.uniforms.resolution.value.set(width, height);
    }
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

