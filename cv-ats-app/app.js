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

  // Update UI to show selected file
  uploadArea.innerHTML = `
    <div class="upload-content">
      <i class="fas fa-file-check upload-icon" style="color: var(--accent-yellow);"></i>
      <p class="upload-text">File Selected</p>
      <p class="upload-subtext">${file.name}</p>
      <p class="upload-subtext">${(file.size / (1024 * 1024)).toFixed(2)} MB</p>
    </div>
  `;

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
  const fileInput = document.getElementById("cv");
  const jobDescription = document.getElementById("job").value.trim();
  const file = fileInput.files[0];

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

    // Step 3: Process CV and calculate ATS score
    // Simulate AI processing with mock data for now
    setTimeout(() => {
      displayMockResults(file.name, jobDescription);
    }, 3000);

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

function displayMockResults(filename, jobDescription) {
  hideLoadingState();
  
  // Mock CV data - in real implementation, this would come from your AI processing
  const mockCVData = {
    name: "John Smith",
    email: "john.smith@email.com",
    phone: "+1 (555) 123-4567",
    location: "New York, NY",
    education: [
      {
        degree: "Bachelor of Science in Computer Science",
        school: "University of Technology",
        year: "2018-2022"
      },
      {
        degree: "Master of Science in Software Engineering",
        school: "Tech Institute",
        year: "2022-2024"
      }
    ],
    experience: [
      {
        position: "Software Developer",
        company: "Tech Corp",
        duration: "2022-2024",
        description: "Developed web applications using React and Node.js"
      },
      {
        position: "Frontend Intern",
        company: "StartupXYZ",
        duration: "2021-2022",
        description: "Built responsive user interfaces"
      }
    ],
    skills: ["JavaScript", "React", "Node.js", "Python", "SQL", "Git", "AWS", "Docker"]
  };

  // Mock ATS scores
  const mockATSScore = {
    overall: 78,
    keyword: 72,
    skills: 85,
    experience: 77
  };

  const mockRecommendations = [
    "Add more specific technical skills mentioned in the job description",
    "Include quantifiable achievements in your experience section",
    "Consider adding relevant certifications",
    "Optimize keywords for better ATS compatibility"
  ];

  // Display CV information
  displayCVInformation(mockCVData);
  
  // Display ATS score with animation
  setTimeout(() => {
    displayATSScore(mockATSScore, mockRecommendations);
  }, 500);

  showNotification("CV analysis completed successfully!", "success");
}

function displayCVInformation(cvData) {
  const cvInfoSection = document.getElementById('cvInfoSection');
  
  // Populate personal information
  document.getElementById('cvName').textContent = cvData.name;
  document.getElementById('cvEmail').textContent = cvData.email;
  document.getElementById('cvPhone').textContent = cvData.phone;
  document.getElementById('cvLocation').textContent = cvData.location;

  // Populate education
  const educationDiv = document.getElementById('cvEducation');
  educationDiv.innerHTML = cvData.education.map(edu => `
    <div style="margin-bottom: 1rem; padding: 1rem; background: var(--gray-50); border-radius: var(--radius-md);">
      <strong>${edu.degree}</strong><br>
      <span style="color: var(--gray-600);">${edu.school}</span><br>
      <small style="color: var(--gray-500);">${edu.year}</small>
    </div>
  `).join('');

  // Populate experience
  const experienceDiv = document.getElementById('cvExperience');
  experienceDiv.innerHTML = cvData.experience.map(exp => `
    <div style="margin-bottom: 1rem; padding: 1rem; background: var(--gray-50); border-radius: var(--radius-md);">
      <strong>${exp.position}</strong><br>
      <span style="color: var(--gray-600);">${exp.company}</span><br>
      <small style="color: var(--gray-500);">${exp.duration}</small><br>
      <p style="margin-top: 0.5rem; font-size: 0.875rem;">${exp.description}</p>
    </div>
  `).join('');

  // Populate skills
  const skillsDiv = document.getElementById('cvSkills');
  skillsDiv.innerHTML = `
    <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
      ${cvData.skills.map(skill => `
        <span style="background: var(--light-blue); color: var(--primary-blue); padding: 0.25rem 0.75rem; border-radius: var(--radius-sm); font-size: 0.875rem; font-weight: 500;">
          ${skill}
        </span>
      `).join('')}
    </div>
  `;

  // Show the section with animation
  cvInfoSection.style.display = 'block';
  cvInfoSection.classList.add('fade-in');
  cvInfoSection.scrollIntoView({ behavior: 'smooth' });
}

function displayATSScore(scores, recommendations) {
  const atsScoreSection = document.getElementById('atsScoreSection');
  
  // Update main score with animation
  const scoreElement = document.getElementById('atsScore');
  animateScore(scoreElement, scores.overall);

  // Update progress bars with animation
  setTimeout(() => {
    animateProgressBar('keywordProgress', 'keywordScore', scores.keyword);
  }, 500);
  
  setTimeout(() => {
    animateProgressBar('skillsProgress', 'skillsScore', scores.skills);
  }, 1000);
  
  setTimeout(() => {
    animateProgressBar('experienceProgress', 'experienceScore', scores.experience);
  }, 1500);

  // Update recommendations
  const recommendationsList = document.getElementById('recommendationsList');
  recommendationsList.innerHTML = recommendations.map(rec => `<li>${rec}</li>`).join('');

  // Show the section with animation
  atsScoreSection.style.display = 'block';
  atsScoreSection.classList.add('fade-in');
  
  setTimeout(() => {
    atsScoreSection.scrollIntoView({ behavior: 'smooth' });
  }, 2000);
}

function animateScore(element, targetScore) {
  let currentScore = 0;
  const increment = targetScore / 50; // 50 steps for smooth animation
  
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
  const progressBar = document.getElementById(progressId);
  const scoreElement = document.getElementById(scoreId);
  
  progressBar.style.width = `${targetScore}%`;
  scoreElement.textContent = `${targetScore}%`;
}

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
