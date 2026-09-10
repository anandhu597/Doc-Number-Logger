// ============================================================
// Stage 0: Confirming the module loads and the DOM is ready
// ============================================================

console.log("app.js loaded");

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM ready — scaffolding in place");
});

// ============================================================
// References
// ============================================================

const videoElement = document.getElementById("video");
const startCamBtn = document.getElementById("startCamBtn");
const captureBtn = document.getElementById("captureBtn");
const canvas = document.getElementById("canvas");
const img = document.getElementById("img");
const errorElement = document.getElementById("errorMsg");

const processedImgEl = document.getElementById("processedImg");
const enhanceOcrEl = document.getElementById("enhanceOcr");

const switchCamEl = document.getElementById("switchCam");

const scanBtn = document.getElementById("scanBtn");
const ocrStatusEl = document.getElementById("ocrStatus");
const ocrOutputEl = document.getElementById("ocrOutput");

const guideFrame = document.getElementById("guide-frame");

// ============================================================
// State Variables
// ============================================================

let currentStream = null;
let currentFacingMode = "environment";

let hasCaptured = false;

let imagDataArr = null;

// ============================================================
// Device Detection
// ============================================================

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

// ============================================================
// Event Listeners
// ============================================================

// Start Camera

startCamBtn.addEventListener("click", startCamera);

// Video Metadata

videoElement.addEventListener("loadedmetadata", () => {
  console.log("Video width:", videoElement.videoWidth);
  console.log("Video height:", videoElement.videoHeight);

  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;

  // Enable the capture button once dimensions are ready
  captureBtn.disabled = false;
});

// Capture Button

captureBtn.addEventListener("click", () => {
  console.log("capture Clicked");

  // 1. Calculate crop region from guide frame position
  const guideRect = guideFrame.getBoundingClientRect();
  const videoRect = videoElement.getBoundingClientRect();

  const relativeX = guideRect.left - videoRect.left;
  const relativeY = guideRect.top - videoRect.top;

  const scaleX = videoElement.videoWidth / videoRect.width;
  const scaleY = videoElement.videoHeight / videoRect.height;

  const sourceX = relativeX * scaleX;
  const sourceY = relativeY * scaleY;
  const sourceWidth = guideRect.width * scaleX;
  const sourceHeight = guideRect.height * scaleY;

  // 2. Resize canvas to match the CROPPED region, not the full video
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;

  const context = canvas.getContext("2d");

  // 3. Draw ONLY the cropped source region onto the canvas
  context.drawImage(
    videoElement,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight, // source: crop area
    0,
    0,
    canvas.width,
    canvas.height, // destination: fills canvas
  );

  const imagData = context.getImageData(0, 0, canvas.width, canvas.height);
  const imageUrl = canvas.toDataURL("image/png");

  imagDataArr = imagData.data;
  if (enhanceOcrEl.checked) {
    applyGrayScale(imagDataArr, context, imagData);
    processedImgEl.src = canvas.toDataURL("image/png");
  }

  img.src = imageUrl;
  hasCaptured = true;
  scanBtn.disabled = false;
});

// Switch Camera

switchCamEl.addEventListener("click", async () => {
  console.log(currentFacingMode);

  currentFacingMode =
    currentFacingMode === "environment" ? "user" : "environment";

  await startCamera();
});

// ============================================================
// Get Bounding Rectangles
// ============================================================

captureBtn.addEventListener("click", () => {
  // 1. Ensure elements are available when clicked
  const guideRect = guideFrame.getBoundingClientRect();
  const videoRect = videoElement.getBoundingClientRect();

  // 2. Calculate relative offsets
  const relativeX = guideRect.left - videoRect.left;
  const relativeY = guideRect.top - videoRect.top;

  // 3. Calculate scales
  const scaleX = videoElement.videoWidth / videoRect.width;
  const scaleY = videoElement.videoHeight / videoRect.height;

  // 4. Source crop coordinates
  const sourceX = relativeX * scaleX;
  const sourceY = relativeY * scaleY;
  const sourceWidth = guideRect.width * scaleX;
  const sourceHeight = guideRect.height * scaleY;

  console.log({ sourceX, sourceY, sourceWidth, sourceHeight });
});
// ============================================================
// Scan Documents / OCR
// ============================================================

scanBtn.addEventListener("click", async () => {
  ocrStatusEl.textContent = "Loading OCR engine…";
  scanBtn.disabled = true;

  try {
    const result = await Tesseract.recognize(canvas, "eng");

    const text = result.data.text;

    ocrOutputEl.textContent = text;
    ocrStatusEl.textContent = "Done!";

    console.log(result); // now this works
  } catch (error) {
    console.error("OCR error:", error);
    ocrStatusEl.textContent = "Scan failed — please retry.";
  } finally {
    scanBtn.disabled = false;
  }
});

// ============================================================
// Helper Functions
// ============================================================

async function startCamera() {
  try {
    // 1. If a stream is already active, stop it before opening a new one
    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop());
    }

    // 2. Await the stream directly (no .then needed)
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: currentFacingMode },
      audio: false,
    });

    // 3. Attach the stream to the video element
    videoElement.srcObject = currentStream;
    errorElement.textContent = ""; // Clear old errors if successful
  } catch (error) {
    console.error("Camera access error:", error);
    errorElement.textContent = `Camera access error: ${error.message}`;
  }
}

function applyGrayScale(data, context, imageData) {
  // 2. Loop through every pixel (step size of 4)
  for (let i = 0; i < data.length; i += 4) {
    const red = data[i];
    const green = data[i + 1];
    const blue = data[i + 2];

    // 3. Grayscale calculation (Luminance formula)
    const gray = 0.299 * red + 0.587 * green + 0.114 * blue;

    // 4. Thresholding (Binarization cutoff)
    const threshold = 128;
    const value = gray > threshold ? 255 : 0; // Pure White (255) or Pure Black (0)

    // 5. Overwrite the RGB channels with the binary value
    data[i] = value; // Red
    data[i + 1] = value; // Green
    data[i + 2] = value; // Blue

    // data[i + 3] remains untouched (Alpha / Opacity)
  }

  // 6. Write modified array back to the canvas
  context.putImageData(imageData, 0, 0);
}
