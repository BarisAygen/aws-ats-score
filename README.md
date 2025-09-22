AWS CV Analyzer + AI Interviewer

This project is a serverless résumé analyzer built with AWS. Users can upload a CV through a simple web interface, provide a job description, and immediately see how well their résumé matches the role. The system runs entirely on AWS, combining S3, Lambda, API Gateway, Textract, and Bedrock.

When a user uploads their CV, it is stored securely in S3 using pre-signed URLs that expire within minutes. A Lambda function then calls Amazon Textract to extract raw text, which is passed to another Lambda using Amazon Bedrock to parse the text into structured JSON. The parsed output includes the candidate’s name, contact details, skills, education, and experience. Another Lambda then compares this structured data to the job description and produces an ATS score, highlighting missing keywords and suggesting improvements.

The frontend is a lightweight static site hosted. Users see a clean workflow: upload a CV, watch text extraction in progress, review the parsed résumé details, and then check their ATS score. Behind the scenes, IAM roles are configured with least-privilege, rate limiting is enforced on API Gateway, and S3 buckets have encryption and lifecycle policies to auto-delete files after a set period.

A new feature extends the project beyond résumé parsing and scoring. Using Amazon Bedrock, the system now includes an AI Interviewer chatbot that can simulate an interview based on the candidate’s CV and the job description. The chatbot asks role-specific questions, tests knowledge, and provides feedback, turning the platform into an interactive career assistant rather than just an ATS checker.

Deployment is fully serverless. The backend is handled by AWS Lambda and API Gateway, the frontend is hosted statically, and storage is managed with Amazon S3. The result is a scalable, secure, and user-friendly tool for job seekers.
