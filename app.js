/* ============================================================
   STAGE 1: DOM REFERENCES
   ============================================================ */
const videoElement = document.getElementById("video");
const startCamBtn = document.getElementById("startCamBtn");
const stopCamBtn = document.getElementById("stopCamBtn");
const captureBtn = document.getElementById("captureBtn");
const switchCamEl = document.getElementById("switchCam");

const canvas = document.getElementById("canvas");
const img = document.getElementById("img");
const processedImgEl = document.getElementById("processedImg");
const enhanceOcrEl = document.getElementById("enhanceOcr");

const errorElement = document.getElementById("errorMsg");
const scanBtn = document.getElementById("scanBtn");
const ocrStatusEl = document.getElementById("ocrStatus");
const ocrOutputEl = document.getElementById("ocrOutput");

const guideFrame = document.getElementById("guide-frame");
const docNumberResultEl = document.getElementById("docNumberResult");

const logSectionEl = document.getElementById("tableArea");
const inputEl = document.getElementById("input");
const noteInputEl = document.getElementById("noteInput");
const confirmLogBtn = document.getElementById("confirm-log-btn");
const logMsgEl = document.getElementById("logMsg");
const retryBtn = document.getElementById("retryBtn");
const clearLogBtn = document.getElementById("clearLogBtn");

/* ============================================================
   STAGE 2: STATE
   ============================================================ */
let currentStream = null;
let currentFacingMode = "environment";
let rawCapture = null; // the last capture before "Enhance", so the checkbox can be toggled after capturing
let ocrWorkerPromise = null; // one OCR engine, created once and reused for every scan
let ocrReady = false;

const STORAGE_KEY = "docNumberLog.v1";
const scanLog = loadLog(); // saved on this phone, survives refresh

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycby4BTDd_EeG52RhdQ-U5vzl7HDw9vkk-Qsl_f7mnfsAJcQA-l4QbAa1ElCuE-MF9ilWng/exec";

// Only these characters can appear in a document number, so OCR is told to look for nothing else
const OCR_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-";

// --- doc-number parsing start ---
// Order matters: the first pattern that matches wins.
// (?<!\d) and (?!\d) stop extra digits on either side from sneaking into a match.
const DOC_PATTERNS = [
  ["Cash Receipt Voucher", "\\d{4}-CSH-RV-\\d{6}"],
  ["Bank Receipt Voucher", "\\d{4}-BNK-RV-\\d{6}"],
  ["Bank Payment Voucher", "\\d{4}-BNK-PV-\\d{6}"],
  ["Post-Dated Cheque Voucher (AP PDC)", "\\d{4}-PDC-PV-\\d{6}"],
  ["Debit Note", "\\d{4}-AP-CML-DN-\\d{5,6}"],
  ["AP Tax Debit Note", "\\d{4}-AP-TAX-DN-\\d{5,6}"],
  ["FT Commercial Debit Note", "\\d{4}-FT-CML-DN-\\d{5,6}"],
  ["General Journal Voucher", "\\d{4}-GEN-JV-\\d{6}"],
  ["AP Commercial Invoice", "\\d{4}-AP-CML-INV-\\d{5,6}"],
  ["Invoice", "\\d{4}-AP-INV-\\d{5,6}"],
  ["Commercial Invoice", "\\d{4}-CML-INV-\\d{5,6}"],
  ["Tax Invoice", "\\d{4}-TAX-INV-\\d{5,6}"],
  ["Vendor Invoice", "\\d{4}-VNDR-INV-\\d{5,6}"],
  ["Sales Return Tax Credit Note", "\\d{4}-SRTAXCN-\\d{5,6}"],
  ["FT Tax Credit Note", "\\d{4}-FT-TAX-CN-\\d{5,6}"],
  ["FT Commercial Credit Note", "\\d{4}-FT-CML-CN-\\d{5,6}"],
  ["Purchase Order", "\\d{4}-PO-\\d{5,6}"],
  ["Goods Received Note", "\\d{4}-GRN-\\d{5,6}"],
  ["Fallback Secondary", "\\d{4}-\\d{6}"],
].map(([type, body]) => ({ type, pattern: new RegExp(`(?<!\\d)${body}(?!\\d)`, "i") }));

// Letters OCR often reads in place of digits, and the other way round
const TO_DIGIT = { O: "0", Q: "0", D: "0", I: "1", L: "1", "|": "1", Z: "2", S: "5", B: "8", G: "6" };
const TO_LETTER = { 0: "O", 1: "I", 2: "Z", 5: "S", 8: "B", 6: "G" };

// Returns { number, typeName, prefix } or null.
// prefix = number without the trailing serial, e.g. "5040-BNK-PV"
function extractDocNumber(rawText) {
  if (!rawText) return null;
  const text = rawText.toUpperCase().replace(/[–—]/g, "-").replace(/\s*-\s*/g, "-");

  // Try the text as read first; only if that fails, try again with look-alike characters fixed
  return matchPatterns(text) || matchPatterns(fixLookalikes(text));
}

function matchPatterns(text) {
  for (const { type, pattern } of DOC_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return {
        number: match[0],
        typeName: type,
        prefix: match[0].replace(/-\d{5,6}$/, ""),
      };
    }
  }
  return null;
}

// In each dashed chunk like "5O4O-P0-12S45": the first 4 characters and the
// last (up to 6) characters should be digits, the parts in between should be letters.
function fixLookalikes(text) {
  const swap = (s, map) => s.replace(/./g, (ch) => map[ch] ?? ch);

  return text.replace(/[A-Z0-9|]+(?:-[A-Z0-9|]+)+/g, (chunk) => {
    const parts = chunk.split("-");
    const last = parts.length - 1;
    return parts
      .map((p, i) => {
        if (i === 0) return p.slice(0, -4) + swap(p.slice(-4), TO_DIGIT);
        if (i === last) return swap(p.slice(0, 6), TO_DIGIT) + p.slice(6);
        return swap(p, TO_LETTER);
      })
      .join("-");
  });
}
// --- doc-number parsing end ---

/* ============================================================
   STAGE 3: EVENT LISTENERS
   ============================================================ */
startCamBtn.addEventListener("click", startCamera);
stopCamBtn.addEventListener("click", stopCamera);

videoElement.addEventListener("loadedmetadata", () => {
  captureBtn.disabled = false;
});

captureBtn.addEventListener("click", () => {
  if (!currentStream || !videoElement.videoWidth) return;

  const crop = getGuideCrop();
  const scale = crop.w < 1000 ? 2 : 1; // small crops read better when enlarged

  canvas.width = Math.round(crop.w * scale);
  canvas.height = Math.round(crop.h * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingQuality = "high";
  context.drawImage(videoElement, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);

  rawCapture = context.getImageData(0, 0, canvas.width, canvas.height);
  img.src = canvas.toDataURL("image/png");
  img.hidden = false;

  applyEnhanceSetting();

  scanBtn.disabled = false;
  ocrStatusEl.textContent = "Image captured. Press Scan Document.";
});

enhanceOcrEl.addEventListener("change", applyEnhanceSetting);

switchCamEl.addEventListener("click", async () => {
  currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
  await startCamera();
});

scanBtn.addEventListener("click", async () => {
  scanBtn.disabled = true;
  ocrStatusEl.textContent = ocrReady ? "Reading…" : "Loading OCR engine…";

  try {
    const worker = await getOcrWorker();
    ocrStatusEl.textContent = "Reading…";
    const { data } = await worker.recognize(canvas);
    ocrOutputEl.textContent = data.text;

    const found = extractDocNumber(data.text);
    if (found) {
      inputEl.value = found.number;
      docNumberResultEl.className = "result-ok";
      docNumberResultEl.textContent = found.number;
      ocrStatusEl.textContent = "Done!";
    } else {
      // Leave whatever is in the number box alone
      docNumberResultEl.className = "result-bad";
      docNumberResultEl.textContent = "No document number detected — please retry";
      ocrStatusEl.textContent = "Done, but no number found.";
    }
  } catch (error) {
    console.error("OCR error:", error);
    ocrStatusEl.textContent = "Scan failed — please retry.";
  } finally {
    scanBtn.disabled = false;
  }
});

confirmLogBtn.addEventListener("click", logCurrent);

// Press Enter / Done in the number box to log quickly
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    logCurrent();
  }
});

retryBtn.addEventListener("click", async () => {
  const failed = scanLog.filter((e) => e.sync === "failed");
  if (!failed.length) return;

  retryBtn.disabled = true;
  showLogMsg(`Resending ${failed.length}…`, false);

  let stillFailed = 0;
  for (const entry of failed) {
    // One at a time so rows land in the sheet in order
    if (!(await sendEntry(entry))) stillFailed++;
  }

  retryBtn.disabled = false;
  if (stillFailed) showLogMsg(`${stillFailed} still not sent. Check your connection and try again.`, true);
  else showLogMsg("All sent to the sheet.", false);
});

clearLogBtn.addEventListener("click", () => {
  if (!scanLog.length) return;
  const unsent = scanLog.filter((e) => e.sync !== "ok").length;
  const question = unsent
    ? `Clear the log on this phone? ${unsent} entr${unsent === 1 ? "y has" : "ies have"} NOT reached the sheet and will be lost.`
    : "Clear the log on this phone? (Your Google Sheet is not touched.)";
  if (!confirm(question)) return;

  scanLog.length = 0;
  saveLog();
  renderLog();
  showLogMsg("Log cleared.", false);
});

/* ============================================================
   STAGE 4: HELPERS
   ============================================================ */
async function startCamera() {
  try {
    if (currentStream) currentStream.getTracks().forEach((t) => t.stop());

    currentStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: currentFacingMode },
      audio: false,
    });
    videoElement.srcObject = currentStream;
    errorElement.textContent = "";
    startCamBtn.disabled = true;
    stopCamBtn.disabled = false;
    switchCamEl.disabled = false;
  } catch (error) {
    console.error("Camera access error:", error);
    errorElement.textContent = `Camera access error: ${error.message}`;
  }
}

function stopCamera() {
  if (currentStream) currentStream.getTracks().forEach((t) => t.stop());
  currentStream = null;
  videoElement.srcObject = null;
  startCamBtn.disabled = false;
  stopCamBtn.disabled = true;
  captureBtn.disabled = true;
  switchCamEl.disabled = true;
}

// Where the red guide frame sits on the real camera image (kept inside the image)
function getGuideCrop() {
  const g = guideFrame.getBoundingClientRect();
  const v = videoElement.getBoundingClientRect();
  const scaleX = videoElement.videoWidth / v.width;
  const scaleY = videoElement.videoHeight / v.height;

  const x = Math.max(0, (g.left - v.left) * scaleX);
  const y = Math.max(0, (g.top - v.top) * scaleY);
  const w = Math.min(videoElement.videoWidth - x, g.width * scaleX);
  const h = Math.min(videoElement.videoHeight - y, g.height * scaleY);
  return { x, y, w, h };
}

// Draws either the plain capture or the black-and-white version onto the canvas (OCR reads the canvas)
function applyEnhanceSetting() {
  if (!rawCapture) return;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (enhanceOcrEl.checked) {
    const copy = new ImageData(new Uint8ClampedArray(rawCapture.data), rawCapture.width, rawCapture.height);
    toBlackAndWhite(copy.data);
    context.putImageData(copy, 0, 0);
    processedImgEl.src = canvas.toDataURL("image/png");
    processedImgEl.hidden = false;
  } else {
    context.putImageData(rawCapture, 0, 0);
    processedImgEl.removeAttribute("src");
    processedImgEl.hidden = true;
  }
}

// Grayscale, then pick the black/white cut-off from the image itself (Otsu's method),
// so it still works in dim or very bright light instead of a fixed 128.
function toBlackAndWhite(data) {
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = gray;
    histogram[gray]++;
  }

  const total = data.length / 4;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * histogram[t];

  let sumBack = 0, weightBack = 0, best = 0, threshold = 128;
  for (let t = 0; t < 256; t++) {
    weightBack += histogram[t];
    if (!weightBack) continue;
    const weightFore = total - weightBack;
    if (!weightFore) break;
    sumBack += t * histogram[t];
    const meanBack = sumBack / weightBack;
    const meanFore = (sumAll - sumBack) / weightFore;
    const between = weightBack * weightFore * (meanBack - meanFore) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }

  for (let i = 0; i < data.length; i += 4) {
    const value = data[i] > threshold ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = value;
  }
}

// Creates the OCR engine once. If it fails (e.g. no internet), the next scan tries again.
function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const worker = await Tesseract.createWorker("eng");
      await worker.setParameters({ tessedit_char_whitelist: OCR_CHARS });
      ocrReady = true;
      return worker;
    })().catch((err) => {
      ocrWorkerPromise = null;
      throw err;
    });
  }
  return ocrWorkerPromise;
}

function logCurrent() {
  const raw = inputEl.value.trim();
  if (!raw) return showLogMsg("Enter or scan a document number first.", true);

  // Re-check so typed corrections get the right type
  const found = extractDocNumber(raw);
  const docNumber = found ? found.number : raw.toUpperCase();

  // Duplicate check against everything saved on this phone
  if (scanLog.some((e) => e.docNumber === docNumber)) {
    return showLogMsg(`${docNumber} is already logged.`, true);
  }

  const entry = {
    timestamp: formatStamp(new Date()),
    docType: found ? found.prefix : "Unknown",
    docTypeName: found ? found.typeName : "Unknown",
    docNumber,
    note: noteInputEl.value.trim(),
    sync: "pending",
  };

  scanLog.push(entry);
  saveLog();
  renderLog();

  // Number and note stay in their boxes, so the next one is quick to type
  inputEl.value = docNumber;
  docNumberResultEl.className = "";
  docNumberResultEl.textContent = "Waiting for scan…";
  showLogMsg(`Logged ${docNumber}.`, false);

  // Send in the background: the sheet never blocks the screen
  sendEntry(entry).then((ok) => {
    if (!ok) showLogMsg(`${docNumber} is saved on this phone, but didn't reach the sheet. Tap "Resend failed" later.`, true);
  });
}

async function sendEntry(entry) {
  entry.sync = "pending";
  renderLog();
  const ok = await syncEntryToSheet(entry);
  entry.sync = ok ? "ok" : "failed";
  saveLog();
  renderLog();
  return ok;
}

// Resolves true only if the script says the row was written
async function syncEntryToSheet(entry) {
  const { timestamp, docType, docNumber, note } = entry;
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ timestamp, docType, docNumber, note }),
    });
    if (!res.ok) return false;
    const reply = await res.json();
    return reply.status === "ok";
  } catch (err) {
    console.error("Sync failed:", err);
    return false;
  }
}

// "2026-10-26 13:00" (local time)
function formatStamp(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function showLogMsg(text, isError) {
  logMsgEl.textContent = text;
  logMsgEl.className = isError ? "msg-error" : "msg-ok";
}

const SYNC_LABEL = {
  ok: ["✓", "Sent to sheet", "sync-ok"],
  failed: ["✗", "Not sent — tap Resend failed", "sync-failed"],
  pending: ["…", "Sending", "sync-pending"],
};

function renderLog() {
  const failedCount = scanLog.filter((e) => e.sync === "failed").length;
  retryBtn.hidden = failedCount === 0;
  retryBtn.textContent = `Resend failed (${failedCount})`;
  clearLogBtn.hidden = scanLog.length === 0;

  logSectionEl.innerHTML = "";
  if (scanLog.length === 0) {
    logSectionEl.innerHTML = "<p>No documents logged yet.</p>";
    return;
  }

  const table = document.createElement("table");
  const head = table.createTHead().insertRow();
  ["#", "Date & time", "Doc type", "Doc number", "Note", "Sheet"].forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    head.appendChild(th);
  });

  // Newest on top
  const tbody = table.createTBody();
  for (let i = scanLog.length - 1; i >= 0; i--) {
    const e = scanLog[i];
    const row = tbody.insertRow();
    row.insertCell().textContent = i + 1;
    row.insertCell().textContent = e.timestamp;
    const typeCell = row.insertCell();
    typeCell.textContent = e.docType;
    typeCell.title = e.docTypeName;
    row.insertCell().textContent = e.docNumber;
    row.insertCell().textContent = e.note;

    const [mark, title, cls] = SYNC_LABEL[e.sync] || SYNC_LABEL.failed;
    const syncCell = row.insertCell();
    syncCell.textContent = mark;
    syncCell.title = title;
    syncCell.className = cls;
  }
  logSectionEl.appendChild(table);
}

function loadLog() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(saved)) return [];
    // Anything still "sending" when the page was closed is treated as not sent
    return saved.map((e) => (e.sync === "pending" ? { ...e, sync: "failed" } : e));
  } catch {
    return [];
  }
}

function saveLog() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scanLog));
  } catch (err) {
    console.warn("Could not save log on this phone:", err);
  }
}

/* ============================================================
   STAGE 5: START
   ============================================================ */
renderLog();
getOcrWorker().catch(() => {}); // start loading OCR in the background so the first scan is faster
