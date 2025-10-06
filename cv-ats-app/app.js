const API_BASE = "https://YOUR_API_BASE"; // placeholder for public repo (no real endpoint)

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
  uploadArea.addEventListener('click', (e) => {
    // Prevent double triggering if user clicks directly on file input
    if (e.target === fileInput) return;
    fileInput.click();
  });
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
      const parsed = await parseWithBedrock(text);
      showParseResult(parsed, jobDescription);
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

async function parseWithBedrock(text) {
  const res = await fetch(`${API_BASE}/parse`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ text })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Parse failed");
  return data.parsed; 
}

// UI helpers
function showUploadSummary(s3Key, file, jobDescription) {
  const cvInfoSection = document.getElementById('cvInfoSection');
  const atsScoreSection = document.getElementById('atsScoreSection');

  cvInfoSection.innerHTML = `
    <h2 class="section-title"><i class="fas fa-check-circle" style="color: var(--accent-yellow);"></i> CV Successfully Uploaded</h2>
    <div class="cv-info-grid">
      <div class="info-card">
        <h3><i class="fas fa-file-alt"></i> Your CV</h3>
        <div class="info-content">
          <div class="info-item"><label>File Name:</label><span>${file.name}</span></div>
          <div class="info-item"><label>File Size:</label><span>${(file.size / (1024 * 1024)).toFixed(2)} MB</span></div>
          <div class="info-item"><label>Status:</label><span style="color: var(--accent-yellow); font-weight: 600;"><i class="fas fa-check-circle"></i> Ready for Analysis</span></div>
        </div>
      </div>
      <div class="info-card">
        <h3><i class="fas fa-briefcase"></i> Target Position</h3>
        <div class="info-content">
          <div style="max-height: 200px; overflow-y: auto; padding: 1rem; background: var(--gray-50); border-radius: var(--radius-md); font-size: 0.875rem; line-height: 1.6; color: var(--gray-700);">
            ${jobDescription.length > 300 ? jobDescription.substring(0, 300) + '...' : jobDescription}
          </div>
          ${jobDescription.length > 300 ? `
            <div style="margin-top: 0.5rem;">
              <small style="color: var(--gray-600);"><i class="fas fa-info-circle"></i> Showing first 300 characters</small>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
  atsScoreSection.innerHTML = `
    <h2 class="section-title"><i class="fas fa-cog fa-spin"></i> Processing</h2>
    <div class="score-container" style="text-align:center;">
      <div style="padding:2rem;">
        <div style="background: var(--light-blue); padding: 2rem; border-radius: var(--radius-xl); border: 2px solid var(--primary-blue);">
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

async function computeATS() {
  const parsed = window.__parsedCv, jd = window.__jobDesc || "";
  if (!parsed || !jd) { showNotification("Missing parsed CV or job description.", "error"); return; }

  showATSLoading();
  try {
    console.log("POST", `${API_BASE}/score`);
    const res = await fetch(`${API_BASE}/score`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ parsedCv: parsed, jobDescription: jd })
    });
    const raw = await res.text();            // <- önce text al
    console.log("status", res.status, "raw", raw);
    let data; try { data = JSON.parse(raw); } catch { 
      throw new Error(`Non-JSON response (${res.status})`); 
    }
    if (!res.ok || !data.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    renderScore(data);
  } catch (err) {
    console.error("score error", err);
    showNotification(`Failed to calculate ATS score: ${err.message}`, "error");
  }
}

function showATSLoading() {
  const el = document.getElementById('atsScoreSection');
  el.innerHTML = `
    <h2 class="section-title"><i class="fas fa-chart-line"></i> Calculating ATS Score</h2>
    <div class="ats-loading-container">
      <div class="ats-loading-circle">
        <div class="ats-loading-score">
          <div class="ats-loading-number" id="loadingNumber">0</div>
          <div class="ats-loading-label">ATS Score</div>
        </div>
        <svg class="ats-progress-ring" width="200" height="200">
          <circle class="ats-progress-ring-bg" cx="100" cy="100" r="85" />
          <circle class="ats-progress-ring-progress" id="progressRing" cx="100" cy="100" r="85" />
        </svg>
      </div>
      <div class="ats-loading-text">
        <i class="fas fa-brain fa-pulse"></i>
        <span id="loadingText">Analyzing CV with AI...</span>
      </div>
      <div class="ats-progress-bar">
        <div class="ats-progress-fill" id="progressFill"></div>
      </div>
    </div>
  `;
  
  // Start the loading animation
  animateLoading();
}

function animateLoading() {
  const loadingNumber = document.getElementById('loadingNumber');
  const loadingText = document.getElementById('loadingText');
  const progressFill = document.getElementById('progressFill');
  const progressRing = document.getElementById('progressRing');
  
  const messages = [
    "Analyzing CV content...",
    "Extracting keywords...",
    "Matching job requirements...",
    "Calculating compatibility...",
    "Finalizing score..."
  ];
  
  let progress = 0;
  let messageIndex = 0;
  
  const interval = setInterval(() => {
    progress += Math.random() * 15 + 5; // Random increment between 5-20
    if (progress > 95) progress = 95; // Don't reach 100 until done
    
    // Update number
    loadingNumber.textContent = Math.round(progress);
    
    // Update progress bar
    progressFill.style.width = `${progress}%`;
    
    // Update progress ring
    const circumference = 2 * Math.PI * 85;
    const strokeDashoffset = circumference - (progress / 100) * circumference;
    progressRing.style.strokeDashoffset = strokeDashoffset;
    
    // Update message
    if (Math.random() > 0.7 && messageIndex < messages.length - 1) {
      messageIndex++;
      loadingText.textContent = messages[messageIndex];
    }
    
    if (progress >= 95) {
      clearInterval(interval);
    }
  }, 300);
  
  // Store interval ID for cleanup
  window.atsLoadingInterval = interval;
}

function renderScore(s) {
  // stop loading anim
  if (window.atsLoadingInterval) clearInterval(window.atsLoadingInterval);

  // tolerate shapes
  const matched = Array.isArray(s.matchedKeywords)
    ? s.matchedKeywords
    : (Array.isArray(s.semantic?.matchedKeywords) ? s.semantic.matchedKeywords : []);
  const missing = Array.isArray(s.missingKeywords)
    ? s.missingKeywords
    : (Array.isArray(s.semantic?.missingKeywords) ? s.semantic.missingKeywords : []);
  const notes = Array.isArray(s.notes) ? s.notes : [];
  const suggestions = Array.isArray(s.suggestions) ? s.suggestions : [];

  const el = document.getElementById('atsScoreSection');

  const missingHtml = missing.length
    ? missing.slice(0,15).map(k=>`<span class="keyword-tag missing">${k}</span>`).join("")
    : "<em>No missing keywords found</em>";

  const matchedHtml = matched.length
    ? matched.slice(0,20).map(k=>`<span class="keyword-tag matched">${k}</span>`).join("")
    : "<em>No keyword matches found</em>";

  const score = Number(s.score ?? 0);
  const scoreColor = score >= 80 ? '#28a745' : score >= 60 ? '#ffc107' : '#dc3545';
  const scoreStatus = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : 'Needs Improvement';
  const scoreIcon = score >= 80 ? 'fa-check-circle' : score >= 60 ? 'fa-exclamation-circle' : 'fa-times-circle';

  el.innerHTML = `
    <h2 class="section-title"><i class="fas fa-chart-line"></i> ATS Score Results</h2>

    <div class="ats-score-hero">
      <div class="ats-score-circle">
        <div class="ats-score-content">
          <div class="ats-score-number" style="color:${scoreColor};">${score}</div>
          <div class="ats-score-total">/100</div>
        </div>
        <svg class="ats-score-ring" width="200" height="200">
          <circle class="ats-score-ring-bg" cx="100" cy="100" r="85" />
          <circle class="ats-score-ring-progress" cx="100" cy="100" r="85"
            style="stroke:${scoreColor};stroke-dasharray:${2*Math.PI*85};
                   stroke-dashoffset:${2*Math.PI*85 - (score/100)*(2*Math.PI*85)};" />
        </svg>
      </div>
      <div class="ats-score-status">
        <i class="fas ${scoreIcon}" style="color:${scoreColor};"></i>
        <span style="color:${scoreColor};">${scoreStatus}</span>
      </div>
    </div>

    <div class="ats-results-grid">
      <div class="ats-result-card matched">
        <div class="ats-result-header">
          <i class="fas fa-check-circle"></i>
          <h3>Matched Keywords</h3>
          <span class="keyword-count">${matched.length}</span>
        </div>
        <div class="keyword-container">${matchedHtml}</div>
      </div>

      <div class="ats-result-card missing">
        <div class="ats-result-header">
          <i class="fas fa-exclamation-triangle"></i>
          <h3>Missing Keywords</h3>
          <span class="keyword-count">${missing.length}</span>
        </div>
        <div class="keyword-container">${missingHtml}</div>
      </div>
    </div>

    ${(notes.length || suggestions.length) ? `
      <div class="ats-notes-card">
        <div class="ats-notes-header">
          <i class="fas fa-lightbulb"></i>
          <h3>Recommendations</h3>
        </div>
        <ul class="ats-notes-list">
          ${[...notes, ...suggestions].map(n=>`<li><i class="fas fa-arrow-right"></i>${n}</li>`).join("")}
        </ul>
      </div>
    ` : ''}

    <div class="chat-launch-section">
      <div class="chat-launch-card">
        <div class="chat-launch-header"><i class="fas fa-comments"></i><h3>Ready for Interview Practice?</h3></div>
        <p class="chat-launch-description">Get personalized interview questions based on your CV and the job requirements.</p>
        <button class="chat-launch-btn" onclick="startAIChat()"><i class="fas fa-robot"></i> Chat with AI Interviewer</button>
      </div>
    </div>
  `;

  setTimeout(() => {
    const ring = el.querySelector('.ats-score-ring-progress');
    if (ring) ring.style.transition = 'stroke-dashoffset 2s ease-in-out';
  }, 100);
}

function showParseResult(parsed, jobDescription) {
  const atsScoreSection = document.getElementById('atsScoreSection');

  const esc = s => String(s ?? "").replace(/[<>&]/g, m => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[m]));

  const contact = parsed?.contact || {};
  const skills = Array.isArray(parsed?.skills) ? parsed.skills : [];
  const exp = Array.isArray(parsed?.experience) ? parsed.experience : [];
  const edu = Array.isArray(parsed?.education) ? parsed.education : [];

  const skillsHtml = skills.length ? `<ul>${skills.slice(0,30).map(x=>`<li>${esc(x)}</li>`).join("")}</ul>` : "<em>No skills parsed</em>";
  const expHtml = exp.length ? exp.slice(0,5).map(e=>`
    <div class="info-item" style="margin-bottom:.75rem;">
      <strong>${esc(e.title||"")}</strong> @ ${esc(e.company||"")}
      <div style="color:var(--gray-600);font-size:.85rem;">${esc(e.start||"")} – ${esc(e.end||"")} • ${esc(e.location||"")}</div>
      ${Array.isArray(e.bullets)&&e.bullets.length?`<ul>${e.bullets.slice(0,6).map(b=>`<li>${esc(b)}</li>`).join("")}</ul>`:""}
    </div>`).join("") : "<em>No experience parsed</em>";
  const eduHtml = edu.length ? edu.slice(0,5).map(d=>`
    <div class="info-item" style="margin-bottom:.5rem;">
      <strong>${esc(d.degree||"")}</strong> – ${esc(d.school||"")}
      <div style="color:var(--gray-600);font-size:.85rem;">${esc(d.start||"")} – ${esc(d.end||"")}${d.gpa?` • GPA: ${esc(d.gpa)}`:""}</div>
    </div>`).join("") : "<em>No education parsed</em>";

  atsScoreSection.innerHTML = `
    <h2 class="section-title"><i class="fas fa-user-check"></i> Parsed CV</h2>

    <div class="cv-info-grid">
      <div class="info-card">
        <h3><i class="fas fa-id-card"></i> Profile</h3>
        <div class="info-content">
          <div class="info-item"><label>Name:</label><span>${esc(parsed?.name||"")}</span></div>
          <div class="info-item"><label>Email:</label><span>${esc(contact.email||"")}</span></div>
          <div class="info-item"><label>Phone:</label><span>${esc(contact.phone||"")}</span></div>
          <div class="info-item"><label>Location:</label><span>${esc(contact.location||"")}</span></div>
          <div class="info-item"><label>LinkedIn:</label><span>${esc(contact.linkedin||"")}</span></div>
          <div class="info-item"><label>GitHub:</label><span>${esc(contact.github||"")}</span></div>
        </div>
      </div>

      <div class="info-card">
        <h3><i class="fas fa-tools"></i> Skills</h3>
        <div class="info-content">${skillsHtml}</div>
      </div>
    </div>

    <div class="info-card" style="margin-top:1rem;">
      <h3><i class="fas fa-briefcase"></i> Experience</h3>
      <div class="info-content">${expHtml}</div>
    </div>

    <div class="info-card" style="margin-top:1rem;">
      <h3><i class="fas fa-graduation-cap"></i> Education</h3>
      <div class="info-content">${eduHtml}</div>
    </div>

    <div style="text-align:right;margin-top:1rem;">
      <button id="scoreBtn" style="background:var(--gradient-primary);color:white;border:none;padding:.7rem 1.2rem;border-radius:var(--radius-lg);font-weight:600;cursor:pointer;">
        <i class="fas fa-chart-line"></i> Compute ATS Score
      </button>
    </div>
  `;

  // İleride /score entegrasyonu için parsed ve jobDescription’ı sakla
  window.__parsedCv = parsed;
  window.__jobDesc = jobDescription;

  const btn = document.getElementById('scoreBtn');
  if (btn) btn.onclick = computeATS;
}

function showProcessing(msg) {
  const el = document.getElementById('processingMessage');
  if (el) el.textContent = msg;
}

function showExtractResult(text) {
  const atsScoreSection = document.getElementById('atsScoreSection');
  // Don't show raw extracted text to user, just show processing status
  atsScoreSection.innerHTML = `
    <h2 class="section-title"><i class="fas fa-cog fa-spin"></i> Processing Your CV</h2>
    <div class="score-container" style="text-align: center;">
      <div style="padding: 2rem;">
        <div style="background: var(--light-blue); padding: 2rem; border-radius: var(--radius-xl); border: 2px solid var(--primary-blue);">
          <i class="fas fa-check-circle" style="font-size: 3rem; color: var(--accent-yellow); margin-bottom: 1rem;"></i>
          <h3 style="color: var(--primary-blue); margin-bottom: 1rem;">Text Extraction Complete!</h3>
          <p style="color: var(--gray-700); margin-bottom: 1.5rem;">Your CV content has been successfully extracted and is being analyzed.</p>
          
          <div style="background: var(--white); padding: 1.5rem; border-radius: var(--radius-lg); margin: 1rem auto; max-width: 400px;">
            <h4 style="color: var(--gray-800); margin-bottom: 1rem; text-align: center;">Processing Steps:</h4>
            <ul style="color: var(--gray-700); list-style: none; margin: 0; padding: 0;">
              <li style="margin-bottom: 0.5rem; padding: 0.5rem; display: flex; align-items: center; gap: 0.75rem;">
                <i class="fas fa-check-circle" style="color: var(--accent-yellow); flex-shrink: 0;"></i>
                <span>File uploaded to secure storage</span>
              </li>
              <li style="margin-bottom: 0.5rem; padding: 0.5rem; display: flex; align-items: center; gap: 0.75rem;">
                <i class="fas fa-check-circle" style="color: var(--accent-yellow); flex-shrink: 0;"></i>
                <span>Text extracted from your CV</span>
              </li>
              <li style="margin-bottom: 0.5rem; padding: 0.5rem; display: flex; align-items: center; gap: 0.75rem;">
                <i class="fas fa-clock" style="color: var(--gray-400); flex-shrink: 0;"></i>
                <span>AI analysis and parsing (Next phase)</span>
              </li>
              <li style="margin-bottom: 0.5rem; padding: 0.5rem; display: flex; align-items: center; gap: 0.75rem;">
                <i class="fas fa-clock" style="color: var(--gray-400); flex-shrink: 0;"></i>
                <span>ATS score calculation (Next phase)</span>
              </li>
            </ul>
          </div>
          
          <div style="background: var(--light-yellow); padding: 1rem; border-radius: var(--radius-md); border-left: 4px solid var(--accent-yellow); margin-top: 1rem;">
            <p style="font-size: 0.875rem; color: var(--gray-700); margin: 0;">
              <i class="fas fa-info-circle" style="color: var(--dark-yellow);"></i>
              Text extraction successful! AI-powered analysis and ATS scoring will be available in the next update.
            </p>
          </div>
        </div>
      </div>
    </div>
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
  .notification-error { background-color: #dc3545 !important; }
  .notification-success { background-color: #28a745 !important; }
  .notification-info { background-color: #17a2b8 !important; }
  
  /* ATS Loading Styles */
  .ats-loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 3rem 2rem;
    background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
    border-radius: 1rem;
    margin: 2rem 0;
  }
  
  .ats-loading-circle {
    position: relative;
    margin-bottom: 2rem;
  }
  
  .ats-loading-score {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
  }
  
  .ats-loading-number {
    font-size: 3rem;
    font-weight: 800;
    color: #007bff;
    line-height: 1;
  }
  
  .ats-loading-label {
    font-size: 0.875rem;
    color: #6c757d;
    margin-top: 0.5rem;
  }
  
  .ats-progress-ring {
    transform: rotate(-90deg);
  }
  
  .ats-progress-ring-bg {
    fill: none;
    stroke: #e9ecef;
    stroke-width: 8;
  }
  
  .ats-progress-ring-progress {
    fill: none;
    stroke: #007bff;
    stroke-width: 8;
    stroke-linecap: round;
    stroke-dasharray: ${2 * Math.PI * 85};
    stroke-dashoffset: ${2 * Math.PI * 85};
    transition: stroke-dashoffset 0.3s ease;
  }
  
  .ats-loading-text {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 1.125rem;
    color: #495057;
    margin-bottom: 1.5rem;
  }
  
  .ats-progress-bar {
    width: 100%;
    max-width: 300px;
    height: 8px;
    background: #e9ecef;
    border-radius: 4px;
    overflow: hidden;
  }
  
  .ats-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #007bff, #0056b3);
    border-radius: 4px;
    transition: width 0.3s ease;
    width: 0%;
  }
  
  /* ATS Score Results Styles */
  .ats-score-hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 3rem 2rem;
    background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
    border-radius: 1rem;
    box-shadow: 0 10px 25px rgba(0,0,0,0.1);
    margin: 2rem 0;
  }
  
  .ats-score-circle {
    position: relative;
    margin-bottom: 1.5rem;
  }
  
  .ats-score-content {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
  }
  
  .ats-score-number {
    font-size: 4rem;
    font-weight: 800;
    line-height: 1;
  }
  
  .ats-score-total {
    font-size: 1.5rem;
    color: #6c757d;
    font-weight: 500;
  }
  
  .ats-score-ring {
    transform: rotate(-90deg);
  }
  
  .ats-score-ring-bg {
    fill: none;
    stroke: #e9ecef;
    stroke-width: 10;
  }
  
  .ats-score-ring-progress {
    fill: none;
    stroke-width: 10;
    stroke-linecap: round;
    transition: stroke-dashoffset 2s ease-in-out;
  }
  
  .ats-score-status {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 1.25rem;
    font-weight: 600;
  }
  
  .ats-results-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    margin: 2rem 0;
  }
  
  @media (max-width: 768px) {
    .ats-results-grid {
      grid-template-columns: 1fr;
    }
  }
  
  .ats-result-card {
    background: white;
    border-radius: 1rem;
    padding: 1.5rem;
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    border: 1px solid #e9ecef;
  }
  
  .ats-result-card.matched {
    border-left: 4px solid #28a745;
  }
  
  .ats-result-card.missing {
    border-left: 4px solid #dc3545;
  }
  
  .ats-result-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  
  .ats-result-header i {
    font-size: 1.25rem;
  }
  
  .ats-result-card.matched .ats-result-header i {
    color: #28a745;
  }
  
  .ats-result-card.missing .ats-result-header i {
    color: #dc3545;
  }
  
  .ats-result-header h3 {
    margin: 0;
    font-size: 1.125rem;
    flex: 1;
  }
  
  .keyword-count {
    background: #f8f9fa;
    color: #495057;
    padding: 0.25rem 0.75rem;
    border-radius: 1rem;
    font-size: 0.875rem;
    font-weight: 600;
  }
  
  .keyword-container {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  
  .keyword-tag {
    padding: 0.375rem 0.75rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
  }
  
  .keyword-tag.matched {
    background: #d4edda;
    color: #155724;
    border: 1px solid #c3e6cb;
  }
  
  .keyword-tag.missing {
    background: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
  }
  
  .ats-notes-card {
    background: white;
    border-radius: 1rem;
    padding: 1.5rem;
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    border: 1px solid #e9ecef;
    border-left: 4px solid #17a2b8;
    margin-top: 2rem;
  }
  
  .ats-notes-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  
  .ats-notes-header i {
    color: #17a2b8;
    font-size: 1.25rem;
  }
  
  .ats-notes-header h3 {
    margin: 0;
    font-size: 1.125rem;
  }
  
  .ats-notes-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  
  .ats-notes-list li {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid #f8f9fa;
  }
  
  .ats-notes-list li:last-child {
    border-bottom: none;
  }
  
  .ats-notes-list li i {
    color: #17a2b8;
    margin-top: 0.125rem;
    font-size: 0.875rem;
  }
`;
document.head.appendChild(style);

// Chat System Variables
let chatMessages = [];
let isAITyping = false;

// Dummy AI responses for interview practice
const aiResponses = [
  "Hello! I'm your AI interviewer. I've reviewed your CV and the job description. Let's start with a simple question: Can you tell me about yourself and why you're interested in this position?",
  "That's interesting! Based on your background, I can see you have experience in {skill}. Can you give me a specific example of how you used this skill to solve a problem or achieve a goal?",
  "Great example! Now, looking at the job requirements, I noticed they're looking for someone with strong {requirement} skills. How do you think your experience aligns with this requirement?",
  "Excellent point! Let me ask you about a challenging situation. Can you describe a time when you faced a significant obstacle in a project and how you overcame it?",
  "That shows great problem-solving skills! One more question: Where do you see yourself in 5 years, and how does this role fit into your career goals?",
  "Thank you for those thoughtful answers! Based on our conversation, you seem well-prepared for this type of role. Do you have any questions about the position or the company that I can help clarify?",
  "That's a great question! Is there anything else you'd like to discuss about your qualifications or experience that we haven't covered yet?"
];

let currentResponseIndex = 0;

// Start AI Chat Function
function startAIChat() {
  const chatSection = document.getElementById('aiChatSection');
  const chatMessagesDiv = document.getElementById('chatMessages');
  
  // Show chat section
  chatSection.style.display = 'block';
  chatSection.classList.add('fade-in');
  
  // Clear previous messages
  chatMessagesDiv.innerHTML = '';
  
  // Reset chat state
  currentResponseIndex = 0;
  isAITyping = false;
  
  // Show initial AI greeting
  setTimeout(() => {
    addAIMessage(aiResponses[0]);
    currentResponseIndex = 1;
    chatSection.scrollIntoView({ behavior: 'smooth' });
  }, 500);
}

// Add message to chat
function addMessage(content, isUser = false) {
  const chatMessagesDiv = document.getElementById('chatMessages');
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${isUser ? 'user' : 'ai'}`;
  
  const avatar = document.createElement('div');
  avatar.className = `chat-avatar ${isUser ? 'user' : 'ai'}`;
  avatar.innerHTML = isUser ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';
  
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${isUser ? 'user' : 'ai'}`;
  bubble.textContent = content;
  
  messageDiv.appendChild(avatar);
  messageDiv.appendChild(bubble);
  chatMessagesDiv.appendChild(messageDiv);
  
  // Scroll to bottom
  chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

// Add AI message with typing effect
function addAIMessage(content) {
  const chatMessagesDiv = document.getElementById('chatMessages');
  
  // Show typing indicator
  const typingDiv = document.createElement('div');
  typingDiv.className = 'chat-message ai';
  typingDiv.id = 'typing-indicator';
  
  const avatar = document.createElement('div');
  avatar.className = 'chat-avatar ai';
  avatar.innerHTML = '<i class="fas fa-robot"></i>';
  
  const typingBubble = document.createElement('div');
  typingBubble.className = 'chat-typing';
  typingBubble.innerHTML = `
    <span>AI is thinking</span>
    <div class="chat-typing-dots">
      <div class="chat-typing-dot"></div>
      <div class="chat-typing-dot"></div>
      <div class="chat-typing-dot"></div>
    </div>
  `;
  
  typingDiv.appendChild(avatar);
  typingDiv.appendChild(typingBubble);
  chatMessagesDiv.appendChild(typingDiv);
  chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
  
  isAITyping = true;
  
  // After 2-3 seconds, remove typing and add actual message
  setTimeout(() => {
    chatMessagesDiv.removeChild(typingDiv);
    addMessage(content, false);
    isAITyping = false;
  }, 2000 + Math.random() * 1000); // Random delay between 2-3 seconds
}

// Send user message
function sendMessage() {
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');
  const message = chatInput.value.trim();
  
  if (!message || isAITyping) return;
  
  // Add user message
  addMessage(message, true);
  
  // Clear input
  chatInput.value = '';
  
  // Disable input while AI is responding
  chatInput.disabled = true;
  sendBtn.disabled = true;
  
  // Generate AI response after a short delay
  setTimeout(() => {
    if (currentResponseIndex < aiResponses.length) {
      let response = aiResponses[currentResponseIndex];
      
      // Add some personalization based on dummy data
      response = response.replace('{skill}', 'JavaScript');
      response = response.replace('{requirement}', 'problem-solving');
      
      addAIMessage(response);
      currentResponseIndex++;
    } else {
      // Generate a generic response for continued conversation
      const genericResponses = [
        "That's a thoughtful response! Can you elaborate on that a bit more?",
        "Interesting perspective! How would you apply that in a real-world scenario?",
        "Great point! What challenges do you think you might face in that situation?",
        "I appreciate your honesty. How do you plan to develop in that area?",
        "That shows good self-awareness. What steps would you take to improve?",
        "Excellent! Any other examples you'd like to share?"
      ];
      
      const randomResponse = genericResponses[Math.floor(Math.random() * genericResponses.length)];
      addAIMessage(randomResponse);
    }
    
    // Re-enable input after AI responds
    setTimeout(() => {
      chatInput.disabled = false;
      sendBtn.disabled = false;
      chatInput.focus();
    }, 3000);
    
  }, 1000);
}

// Handle Enter key in chat input
document.addEventListener('DOMContentLoaded', function() {
  const chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }
});
