const apiUrl = 'https://ekzpbpoadiktlflcrrwm.supabase.co/functions/v1/chat';
const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrenBicG9hZGlrdGxmbGNycndtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NDk3NDAsImV4cCI6MjA5MDEyNTc0MH0.Wy0Pq-ZFVEP8evzgGHQUnqUoLLIA_lSEHiQWY1kvQ_w'; // from supabaseClient.js

fetch(apiUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  },
  body: JSON.stringify({ messages: [{ role: 'user', content: 'test' }] })
})
.then(res => res.text().then(text => ({ status: res.status, text })))
.then(result => {
  console.log("Edge Function Response:", result);
})
.catch(err => {
  console.error("Fetch Error:", err);
});
