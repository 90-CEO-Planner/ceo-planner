const apiUrl = 'https://ekzpbpoadiktlflcrrwm.supabase.co/functions/v1/chat';
const apiKey = 'sb_publishable_9wfISELg1l53KvwhNlZ6Iw_BeGy7QS5'; // from supabaseClient.js

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
