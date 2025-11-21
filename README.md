<div align="center">
  <img src="./assets/logo.jpg" alt="Logo" width="160" style="border-radius: 80px">
  <h1>Laser Eyes Simulator</h1>
</div>

A fun web application that adds a cool laser eye effect to your photos or webcam feed! 

## 🚀 Demo

[Online Demo](https://winterx.github.io/lazer-eyes-simulator)


<div align="center">
  <img src="./assets/demo.png" alt="Demo">
</div>

## 🛠 Implementation

This project combines computer vision and 3D graphics to create a real-time augmented reality experience directly in the browser.

1.  **Face Tracking**: We use **MediaPipe Face Mesh** to detect face landmarks in real-time from the video feed. This allows us to precisely locate the position of the eyes.
2.  **3D Rendering**: **Three.js** is used to create a 3D scene overlaid on the video. We generate glowing laser cylinders that originate from the detected eye positions.
3.  **Interaction**: The application tracks the movement of your head and updates the laser positions and angles accordingly, creating a dynamic effect.

## 📚 Tech Stack

*   **[MediaPipe Face Mesh](https://developers.google.com/mediapipe/solutions/vision/face_mesh)**: For robust and fast face landmark detection.
*   **[Three.js](https://threejs.org/)**: For rendering the 3D laser effects and handling the scene graph.
