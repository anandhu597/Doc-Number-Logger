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

const processedImgEl = document.getElementById("processedImg");

const enhanceOcrEl = document.getElementById("enhanceOcr");

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

let imagDataArr = null;
captureBtn.addEventListener("click", () => {
  console.log("capture Clicked");
  const context = canvas.getContext("2d");

  console.log(context);

  context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
  const imagData = context.getImageData(0, 0, canvas.width, canvas.height);

  const imageUrl = canvas.toDataURL("image/png");

  console.log(imagData);
  console.log(imagData.data);

  imagDataArr = imagData.data;
  if (enhanceOcrEl.checked) {
    applyGrayScale(imagDataArr, context, imagData);
    processedImgEl.src = canvas.toDataURL("image/png");
  }

  img.src = imageUrl;
});

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
