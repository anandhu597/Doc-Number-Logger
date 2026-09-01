// Stage 0: just confirming the module loads and the DOM is ready.
console.log("app.js loaded");

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM ready — scaffolding in place");
});

//_______________references____________________

const videoElement = document.getElementById("video");
const startCamBtn = document.getElementById("startCamBtn");
const captureBtn = document.getElementById("captureBtn");
const canvas = document.getElementById("canvas");
const img = document.getElementById("img");
const errorElement = document.getElementById("errorMsg");

let currentStream = null;

startCamBtn.addEventListener("click", async () => {
  try {
    // 1. If a stream is already active, stop it before opening a new one
    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop());
    }

    // 2. Await the stream directly (no .then needed)
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });

    // 3. Attach the stream to the video element
    videoElement.srcObject = currentStream;
    errorElement.textContent = ""; // Clear old errors if successful
  } catch (error) {
    console.error("Camera access error:", error);
    errorElement.textContent = `Camera access error: ${error.message}`;
  }
});

//------just to check

const userAgent = navigator.userAgent;
const isMobileDevice =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    userAgent,
  );

if (isMobileDevice) {
  console.log("Mobile or Tablet device");
} else {
  console.log("Laptop or Desktop");
}

videoElement.addEventListener("loadedmetadata", () => {
  console.log("Video width:", videoElement.videoWidth);
  console.log("Video height:", videoElement.videoHeight);

  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;

  // Enable the capture button once dimensions are ready
  captureBtn.disabled = false;
});

captureBtn.addEventListener("click", () => {
  console.log("capture Clicked");
  const context = canvas.getContext("2d");

  console.log(context);

  context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

  const imageUrl = canvas.toDataURL("image/png");
  //   console.log(imgeUrl);

  img.src = imageUrl;
});
