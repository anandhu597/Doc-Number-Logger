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

// console.log({ video, startCamBtn, captureBtn, canvas, img });

startCamBtn.addEventListener("click", () => {
  navigator.mediaDevices
    .getUserMedia({ video: true, audio: false })
    .then((stream) => {
      // 2. Set the video source to the camera stream
      videoElement.srcObject = stream;
    })
    .catch((error) => {
      // 3. Handle errors (e.g., user denied permission)
      console.error("Camera access error:", error);
    });
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
  console.log("Video duration:", videoElement.duration, "seconds");
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
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
