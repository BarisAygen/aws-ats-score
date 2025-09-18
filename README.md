cv-ats-score-aws

This project shows how to build a simple Cloud + AI app using AWS and Python:
	•	Upload CV (PDF/DOCX) → stored in S3
	•	Lambda generates presigned URL for secure uploads
	•	Textract extracts text from CV
	•	Bedrock (Claude) parses into structured JSON {name, contact, skills, experience, education}
	•	ATS Scoring logic compares CV vs Job Description input
	•	Frontend (HTML/JS) hosted on S3 Static Website
	•	Secured with IAM roles, least privilege, input validation, presigned URLs, CloudWatch monitoring

Architecture
	1.	User opens Single-Page App (S3 Static Website)
	2.	Inputs Job Description text
	3.	Uploads CV via presigned URL (API Gateway → Lambda)
	4.	Lambda triggers Textract → extract raw text
	5.	Bedrock parses CV into JSON structure
	6.	ATS Scoring logic runs (keyword overlap, completeness, etc.)
	7.	Frontend displays structured CV info + ATS Score

AWS Services Used
	•	S3 (static website hosting + CV storage with presigned URLs)
	•	API Gateway (exposes /presign and future /extract endpoints)
	•	Lambda (generate presigned URL, run Textract, call Bedrock, compute ATS score)
	•	Textract (text extraction from PDF/DOCX)
	•	Bedrock (Claude) (parse CV into structured JSON)
	•	IAM Roles (least privilege: only S3/Textract/Bedrock access)
	•	CloudWatch (logs + monitoring for Lambda/API Gateway)

Security
	•	Bucket is private (Block Public Access ON)
	•	Users only upload via short-lived presigned URLs
	•	IAM policies scoped to required actions (s3:PutObject, textract:DetectDocumentText, bedrock:InvokeModel)
	•	CORS configured for specific origins (dev: localhost, prod: static website endpoint)
	•	Input validation (only PDF/DOCX accepted, size <10 MB)

Notes
	•	Frontend is pure HTML/CSS/JS (lightweight, no frameworks)
	•	Demo tested with local + S3 hosted frontend
	•	Designed to be extended: scoring rules, saving history in DynamoDB, or user authentication
	•	Free Tier friendly: serverless stack (no EC2 costs)

⸻
