const API_BASE = "https://fxc57ax0j1.execute-api.eu-west-1.amazonaws.com";

// Initialize
document.addEventListener('DOMContentLoaded', function() {
  initializeUploadArea();
  initializeFormValidation();
});

function initializeUploadArea() {
  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('cv');
  const uploadBtn = document.querySelector('.upload-btn');

  uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
  uploadArea.addEventListener('dragleave', (e) => { e.preventDefault(); uploadArea.classList.remove('dragover'); });
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault(); uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) { fileInput.files = files; handleFileSelection(files[0]); }
  });
  uploadArea.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => { if (e.target.files.length > 0) handleFileSelection(e.target.files[0]); });
}

function handleFileSelection(file) {
  const uploadArea = document.getElementById('uploadArea');
  const uploadBtn = document.querySelector('.upload-btn');
  const allowed = [".pdf", ".docx", ".doc"];
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  if (!allowed.includes(ext)) { showNotification("Please upload a PDF, DOC, or DOCX file.", "error"); return; }
  if (file.size > 10 * 1024 * 1024) { showNotification("File size must be less than 10MB.", "error"); return; }

  const uploadIcon = uploadArea.querySelector('.upload-icon');
  const uploadText = uploadArea.querySelector('.upload-text');
  const uploadSubtext = uploadArea.querySelector('.upload-subtext');
  if (uploadIcon) { uploadIcon.className = 'fas fa-file-check upload-icon'; uploadIcon.style.color = 'var(--accent-yellow)'; }
  if (uploadText) uploadText.textContent = 'File Selected';
  if (uploadSubtext) uploadSubtext.innerHTML = `${file.name}<br>${(file.size / (1024 * 1024)).toFixed(2)} MB`;
  uploadArea.style.borderColor = 'var(--accent-yellow)';
  uploadArea.style.backgroundColor = 'var(--light-yellow)';
  uploadBtn.disabled = false;
  uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Analyze CV';
}

function initializeFormValidation() {
  const jobTextarea = document.getElementById('job');
  jobTextarea.addEventListener('input', () => {
    if (jobTextarea.value.trim().length > 50) jobTextarea.style.borderColor = 'var(--primary-blue)';
  });
}

async function uploadCV() {
  const fileInput = document.getElementById("cv");
  const jobTextarea = document.getElementById("job");
  if (!fileInput || !jobTextarea) { showNotification("DOM not ready. Refresh the page.", "error"); return; }

  const jobDescription = jobTextarea.value.trim();
  const file = fileInput.files && fileInput.files[0];
  if (!file) { showNotification("Please upload your CV first.", "error"); return; }
  if (!jobDescription) { showNotification("Please enter a job description.", "error"); return; }
  if (jobDescription.length < 50) { showNotification("Please enter a more detailed job description (≥50 chars).", "error"); return; }

  const allowed = [".pdf", ".docx", ".doc"];
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  if (!allowed.includes(ext)) { showNotification("Please upload a PDF, DOC, or DOCX file.", "error"); return; }

  showLoadingState();

  try {
    // 1) Presign
    const presignRes = await fetch(`${API_BASE}/presign`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream" })
    });
    const presign = await presignRes.json();
    if (!presign.ok) throw new Error(presign.error || "Failed to get upload URL.");

    // 2) PUT to S3 (Content-Type eşleşiyor)
    const putRes = await fetch(presign.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file
    });
    if (!putRes.ok) throw new Error("Upload failed.");

    hideLoadingState();
    showUploadSummary(presign.key, file, jobDescription);

    // 3) Extract (PDF varsa çağır; DOC/DOCX için placeholder)
    if (ext === ".pdf") {
      showProcessing("Extracting text with AWS Textract…");
      const text = await extractText(presign.key);
      showExtractResult(text);
    } else {
      showProcessing("DOC/DOCX extraction coming soon. PDF works now.");
    }

    showNotification("CV uploaded to AWS S3.", "success");
  } catch (error) {
    hideLoadingState();
    showNotification(error.message || "Unexpected error", "error");
  }
}

// REPLACE this function
async function extractText(key) {
  // 1) Start job (key ile)
  let res = await fetch(`${API_BASE}/extract`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ key })
  });
  let data = await res.json();
  if (!data.ok) throw new Error(data.error || "Extract failed");

  // 2) Hızlı biterse
  if (!data.pending && data.text) return data.text || "";

  // 3) Pending ise jobId ile poll et
  let jobId = data.jobId;
  let delay = 1200;            // ilk bekleme
  const maxDelay = 4000;       // üst sınır
  const deadline = Date.now() + 25000; // toplam ~25s dene

  while (Date.now() < deadline) {
    showProcessing("Extracting…"); // mevcut helper
    await new Promise(r => setTimeout(r, delay));
    res = await fetch(`${API_BASE}/extract`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ jobId })
    });
    data = await res.json();
    if (!data.ok) throw new Error(data.error || "Extract failed");
    if (!data.pending && data.text) return data.text || "";
    delay = Math.min(Math.round(delay * 1.5), maxDelay);
  }

  throw new Error("Textract is still running. Try again.");
}

// UI helpers
function showUploadSummary(s3Key, file, jobDescription) {
  const cvInfoSection = document.getElementById('cvInfoSection');
  const atsScoreSection = document.getElementById('atsScoreSection');

  cvInfoSection.innerHTML = `
    <h2 class="section-title"><i class="fas fa-check-circle" style="color: var(--accent-yellow);"></i> Upload Successful</h2>
    <div class="cv-info-grid">
      <div class="info-card">
        <h3><i class="fas fa-file-upload"></i> File Information</h3>
        <div class="info-content">
          <div class="info-item"><label>File Name:</label><span>${file.name}</span></div>
          <div class="info-item"><label>File Size:</label><span>${(file.size / (1024 * 1024)).toFixed(2)} MB</span></div>
          <div class="info-item"><label>S3 Key:</label><span>${s3Key}</span></div>
          <div class="info-item"><label>Status:</label><span style="color: var(--accent-yellow); font-weight: 600;">Uploaded</span></div>
        </div>
      </div>
      <div class="info-card">
        <h3><i class="fas fa-briefcase"></i> Job Description</h3>
        <div class="info-content">
          <div style="max-height: 200px; overflow-y: auto; padding: 1rem; background: var(--gray-50); border-radius: var(--radius-md); font-size: 0.875rem; line-height: 1.6;">
            ${jobDescription}
          </div>
        </div>
      </div>
    </div>
  `;
  atsScoreSection.innerHTML = `
    <h2 class="section-title"><i class="fas fa-cog fa-spin"></i> Processing</h2>
    <div class="score-container" style="text-align:center;">
      <div style="padding:2rem;">
        <div style="background: var(--light-blue); padding: 2rem; border-radius: var(--radius-xl); border: 2px solid var(--primary-blue);">
          <h3 style="color: var(--primary-blue); margin-bottom: 1rem;">Working…</h3>
          <p id="processingMessage" style="color: var(--gray-700); margin: 0;">Starting…</p>
        </div>
      </div>
    </div>
  `;
  cvInfoSection.style.display = 'block';
  atsScoreSection.style.display = 'block';
  cvInfoSection.classList.add('fade-in');
  atsScoreSection.classList.add('fade-in');
}

function showProcessing(msg) {
  const el = document.getElementById('processingMessage');
  if (el) el.textContent = msg;
}

function showExtractResult(text) {
  const atsScoreSection = document.getElementById('atsScoreSection');
  const preview = (text || "").slice(0, 2000).replace(/[<>&]/g, s => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[s]));
  atsScoreSection.innerHTML = `
    <h2 class="section-title"><i class="fas fa-file-alt"></i> Extracted Text (preview)</h2>
    <div style="background: var(--white); padding: 1rem; border-radius: var(--radius-lg); border: 1px solid var(--gray-200); max-height: 360px; overflow: auto; white-space: pre-wrap; font-size: 0.9rem;">
      ${preview || "<em>No text detected.</em>"}
    </div>
    <p style="margin-top: 0.75rem; color: var(--gray-600); font-size: 0.85rem;">Next: AI parsing → ATS scoring.</p>
  `;
}

function showLoadingState() {
  const loadingSection = document.getElementById('loadingSection');
  const uploadBtn = document.querySelector('.upload-btn');
  loadingSection.style.display = 'block';
  loadingSection.scrollIntoView({ behavior: 'smooth' });
  uploadBtn.disabled = true;
  uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
}

function hideLoadingState() {
  const loadingSection = document.getElementById('loadingSection');
  const uploadBtn = document.querySelector('.upload-btn');
  loadingSection.style.display = 'none';
  uploadBtn.disabled = false;
  uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Analyze CV';
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.style.cssText = `
    position: fixed; top: 20px; right: 20px; padding: 1rem 1.5rem; border-radius: var(--radius-lg);
    color: white; font-weight: 500; z-index: 1000; animation: slideIn 0.3s ease-out; max-width: 400px; box-shadow: var(--shadow-lg);
  `;
  notification.innerHTML = `
    <div style="display:flex;align-items:center;gap:0.5rem;">
      <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-triangle' : 'info-circle'}"></i>
      ${message}
    </div>
  `;
  document.body.appendChild(notification);
  setTimeout(() => { notification.style.animation = 'slideOut 0.3s ease-in'; setTimeout(() => { document.body.removeChild(notification); }, 300); }, 5000);
}

// Notification CSS
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
`;
document.head.appendChild(style);