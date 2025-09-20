const API_BASE = "https://xsel05pgfe.execute-api.eu-north-1.amazonaws.com";

// Initialize page functionality
document.addEventListener('DOMContentLoaded', function() {
  initializeUploadArea();
  initializeFormValidation();
});

function initializeUploadArea() {
  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('cv');
  const uploadBtn = document.querySelector('.upload-btn');

  // Handle drag and drop
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });

  uploadArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      fileInput.files = files;
      handleFileSelection(files[0]);
    }
  });

  // Handle click to browse
  uploadArea.addEventListener('click', () => {
    fileInput.click();
  });

  // Handle file selection
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  });
}

function handleFileSelection(file) {
  const uploadArea = document.getElementById('uploadArea');
  const uploadBtn = document.querySelector('.upload-btn');
  
  // Validate file
  const allowed = [".pdf", ".docx", ".doc"];
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  
  if (!allowed.includes(ext)) {
    showNotification("Please upload a PDF, DOC, or DOCX file.", "error");
    return;
  }
  
  if (file.size > 10 * 1024 * 1024) { // 10MB limit
    showNotification("File size must be less than 10MB.", "error");
    return;
  }

  // Update UI to show selected file without removing elements
  const uploadIcon = uploadArea.querySelector('.upload-icon');
  const uploadText = uploadArea.querySelector('.upload-text');
  const uploadSubtext = uploadArea.querySelector('.upload-subtext');
  
  if (uploadIcon) {
    uploadIcon.className = 'fas fa-file-check upload-icon';
    uploadIcon.style.color = 'var(--accent-yellow)';
  }
  
  if (uploadText) {
    uploadText.textContent = 'File Selected';
  }
  
  if (uploadSubtext) {
    uploadSubtext.innerHTML = `${file.name}<br>${(file.size / (1024 * 1024)).toFixed(2)} MB`;
  }
  
  // Change upload area style to show success
  uploadArea.style.borderColor = 'var(--accent-yellow)';
  uploadArea.style.backgroundColor = 'var(--light-yellow)';

  uploadBtn.disabled = false;
  uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Analyze CV';
}

function initializeFormValidation() {
  const jobTextarea = document.getElementById('job');
  const uploadBtn = document.querySelector('.upload-btn');

  jobTextarea.addEventListener('input', () => {
    // Add visual feedback for job description input
    if (jobTextarea.value.trim().length > 50) {
      jobTextarea.style.borderColor = 'var(--primary-blue)';
    }
  });
}

async function uploadCV() {
  console.log("uploadCV called, DOM ready state:", document.readyState);
  
  const fileInput = document.getElementById("cv");
  const jobTextarea = document.getElementById("job");
  
  console.log("Elements found - fileInput:", !!fileInput, "jobTextarea:", !!jobTextarea);
  
  if (!fileInput) {
    console.error("File input element not found!");
    showNotification("Error: File input not found. Please refresh the page.", "error");
    return;
  }
  
  if (!jobTextarea) {
    console.error("Job textarea element not found!");
    showNotification("Error: Job description field not found. Please refresh the page.", "error");
    return;
  }

  const jobDescription = jobTextarea.value.trim();
  const file = fileInput.files && fileInput.files[0];

  if (!file) { 
    showNotification("Please upload your CV first.", "error");
    return; 
  }

  if (!jobDescription) {
    showNotification("Please enter a job description.", "error");
    return;
  }

  if (jobDescription.length < 50) {
    showNotification("Please enter a more detailed job description (at least 50 characters).", "error");
    return;
  }

  const allowed = [".pdf", ".docx", ".doc"];
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  if (!allowed.includes(ext)) { 
    showNotification("Please upload a PDF, DOC, or DOCX file.", "error");
    return; 
  }

  // Show loading state
  showLoadingState();

  try {
    // Step 1: Get presigned URL
    const presignRes = await fetch(`${API_BASE}/presign`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ 
        filename: file.name, 
        contentType: file.type || "application/octet-stream" 
      })
    });
    
    const presign = await presignRes.json();
    if (!presign.ok) { 
      throw new Error(presign.error || "Failed to get upload URL.");
    }

    // Step 2: Upload file to S3
    const putRes = await fetch(presign.uploadUrl, { 
      method: "PUT", 
      headers: { "Content-Type": file.type || "application/octet-stream" }, 
      body: file 
    });
    
    if (!putRes.ok) { 
      throw new Error("Upload failed.");
    }

    // Step 3: Show success message and real upload results
    hideLoadingState();
    
    // Display upload success with actual file info
    const cvInfoSection = document.getElementById('cvInfoSection');
    const atsScoreSection = document.getElementById('atsScoreSection');
    
    // Show basic upload info
    cvInfoSection.innerHTML = `
      <h2 class="section-title">
        <i class="fas fa-check-circle" style="color: var(--accent-yellow);"></i>
        Upload Successful
      </h2>
      <div class="cv-info-grid">
        <div class="info-card">
          <h3><i class="fas fa-file-upload"></i> File Information</h3>
          <div class="info-content">
            <div class="info-item">
              <label>File Name:</label>
              <span>${file.name}</span>
            </div>
            <div class="info-item">
              <label>File Size:</label>
              <span>${(file.size / (1024 * 1024)).toFixed(2)} MB</span>
            </div>
            <div class="info-item">
              <label>S3 Key:</label>
              <span>${presign.key}</span>
            </div>
            <div class="info-item">
              <label>Status:</label>
              <span style="color: var(--accent-yellow); font-weight: 600;">Successfully Uploaded</span>
            </div>
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
    
    // Show next steps with beautiful design
    atsScoreSection.innerHTML = `
      <h2 class="section-title">
        <i class="fas fa-cog fa-spin"></i>
        Processing Status
      </h2>
      <div class="score-container" style="text-align: center;">
        <div style="padding: 2rem;">
          <div style="background: var(--light-blue); padding: 2rem; border-radius: var(--radius-xl); border: 2px solid var(--primary-blue);">
            <i class="fas fa-check-circle" style="font-size: 3rem; color: var(--accent-yellow); margin-bottom: 1rem;"></i>
            <h3 style="color: var(--primary-blue); margin-bottom: 1rem;">Upload Complete!</h3>
            <p style="color: var(--gray-700); margin-bottom: 1.5rem;">Your CV has been successfully uploaded to AWS S3.</p>
            
            <div style="background: var(--white); padding: 1.5rem; border-radius: var(--radius-lg); margin: 1rem 0;">
              <h4 style="color: var(--gray-800); margin-bottom: 1rem;">Next Steps:</h4>
              <ul style="text-align: left; color: var(--gray-700); list-style: none;">
                <li style="margin-bottom: 0.5rem; padding-left: 1.5rem; position: relative;">
                  <i class="fas fa-check-circle" style="position: absolute; left: 0; color: var(--accent-yellow);"></i>
                  File uploaded to S3 storage
                </li>
                <li style="margin-bottom: 0.5rem; padding-left: 1.5rem; position: relative;">
                  <i class="fas fa-clock" style="position: absolute; left: 0; color: var(--gray-400);"></i>
                  Text extraction with AWS Textract (Coming soon)
                </li>
                <li style="margin-bottom: 0.5rem; padding-left: 1.5rem; position: relative;">
                  <i class="fas fa-clock" style="position: absolute; left: 0; color: var(--gray-400);"></i>
                  AI parsing with AWS Bedrock Claude (Coming soon)
                </li>
                <li style="margin-bottom: 0.5rem; padding-left: 1.5rem; position: relative;">
                  <i class="fas fa-clock" style="position: absolute; left: 0; color: var(--gray-400);"></i>
                  ATS score calculation (Coming soon)
                </li>
              </ul>
            </div>
            
            <div style="background: var(--light-yellow); padding: 1rem; border-radius: var(--radius-md); border-left: 4px solid var(--accent-yellow); margin-top: 1rem;">
              <p style="font-size: 0.875rem; color: var(--gray-700); margin: 0;">
                <i class="fas fa-info-circle" style="color: var(--dark-yellow);"></i>
                Your file is now stored securely in AWS S3. The backend processing pipeline (Textract → Bedrock → ATS scoring) will be implemented in the next development phase.
              </p>
            </div>
            
            <button onclick="location.reload()" style="margin-top: 1.5rem; background: var(--gradient-primary); color: white; border: none; padding: 0.75rem 2rem; border-radius: var(--radius-lg); cursor: pointer; font-weight: 600;">
              <i class="fas fa-plus"></i> Upload Another CV
            </button>
          </div>
        </div>
      </div>
    `;
    
    // Show the sections with animation
    cvInfoSection.style.display = 'block';
    cvInfoSection.classList.add('fade-in');
    atsScoreSection.style.display = 'block';
    atsScoreSection.classList.add('fade-in');
    
    // Scroll to results
    setTimeout(() => {
      cvInfoSection.scrollIntoView({ behavior: 'smooth' });
    }, 300);
    
    showNotification("CV uploaded successfully to AWS S3!", "success");

  } catch (error) {
    hideLoadingState();
    showNotification(error.message, "error");
  }
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

// These functions will be used when backend processing is implemented
// For now, they are commented out as we show real upload results

/*
function displayCVInformation(cvData) {
  // This will be used when Textract + Bedrock processing is implemented
  // For now, we show upload success instead
}

function displayATSScore(scores, recommendations) {
  // This will be used when ATS scoring is implemented
  // For now, we show processing status instead
}

function animateScore(element, targetScore) {
  // Animation for ATS score display
  let currentScore = 0;
  const increment = targetScore / 50;
  
  const timer = setInterval(() => {
    currentScore += increment;
    if (currentScore >= targetScore) {
      currentScore = targetScore;
      clearInterval(timer);
    }
    element.textContent = Math.round(currentScore);
  }, 40);
}

function animateProgressBar(progressId, scoreId, targetScore) {
  // Animation for progress bars
  const progressBar = document.getElementById(progressId);
  const scoreElement = document.getElementById(scoreId);
  
  progressBar.style.width = `${targetScore}%`;
  scoreElement.textContent = `${targetScore}%`;
}
*/

function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 1rem 1.5rem;
    border-radius: var(--radius-lg);
    color: white;
    font-weight: 500;
    z-index: 1000;
    animation: slideIn 0.3s ease-out;
    max-width: 400px;
    box-shadow: var(--shadow-lg);
  `;

  // Set background color based on type
  switch(type) {
    case 'success':
      notification.style.background = 'linear-gradient(135deg, #10b981, #059669)';
      break;
    case 'error':
      notification.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
      break;
    default:
      notification.style.background = 'var(--gradient-primary)';
  }

  notification.innerHTML = `
    <div style="display: flex; align-items: center; gap: 0.5rem;">
      <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-triangle' : 'info-circle'}"></i>
      ${message}
    </div>
  `;

  document.body.appendChild(notification);

  // Remove notification after 5 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 5000);
}

// Add CSS for notification animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(style);
