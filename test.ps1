try {
    $response = Invoke-RestMethod -Method POST -Uri "https://ekzpbpoadiktlflcrrwm.supabase.co/functions/v1/chat" -Headers @{"Content-Type"="application/json"; "Authorization"="Bearer sb_publishable_9wfISELg1l53KvwhNlZ6Iw_BeGy7QS5"} -Body '{"messages":[{"role":"user","content":"test"}]}'
    Write-Host $response
} catch {
    $e = $_.Exception
    Write-Host "Exception Message: $($e.Message)"
    if ($e.Response) {
        $stream = $e.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
        Write-Host "Response Body: $body"
    }
}
