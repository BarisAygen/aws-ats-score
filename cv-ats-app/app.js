const API_BASE = "https://xsel05pgfe.execute-api.eu-north-1.amazonaws.com";

async function uploadCV() {
  const fileInput = document.getElementById("cv");
  const file = fileInput.files[0];
  const resultDiv = document.getElementById("result");

  if (!file) { alert("Please upload your CV."); return; }

  const allowed = [".pdf", ".docx"];
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  if (!allowed.includes(ext)) { alert("Please upload a PDF or DOCX file."); return; }

  const presignRes = await fetch(`${API_BASE}/presign`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream" })
  });
  const presign = await presignRes.json();
  if (!presign.ok) { alert(presign.error || "Failed to get upload URL."); return; }

  const putRes = await fetch(presign.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
  if (!putRes.ok) { alert("Upload failed."); return; }

  resultDiv.innerHTML = `
    <p><strong>Uploaded:</strong> ${file.name}</p>
    <p><strong>S3 Key:</strong> ${presign.key}</p>
    <p>Next: extract text → parse with AI → compute ATS score.</p>
  `;
}
