$files = @(
    "js\supabaseClient.js",
    "js\store.js",
    "js\aiService.js",
    "js\components\nav.js",
    "js\components\tooltip.js",
    "js\screens\welcome.js",
    "js\screens\wizard.js",
    "js\screens\dashboard.js",
    "js\screens\weeklyPlanner.js",
    "js\screens\revenue.js",
    "js\screens\fridayReview.js",
    "js\screens\progress.js",
    "js\screens\settings.js",
    "js\screens\quarterReset.js",
    "js\screens\coach.js",
    "js\screens\monthlyReview.js",
    "js\screens\mondayPlan.js",
    "js\screens\auth.js",
    "js\app.js"
)

$bundle = @"
window.addEventListener('error', function(e) {
    document.body.innerHTML += '<div style="color:red; background:white; position:absolute; top:0; left:0; z-index:9999; padding:20px; border:2px solid red;"><h1>Global Error Caught</h1><p>' + e.message + '</p><p>Line: ' + e.lineno + '</p><p>Col: ' + e.colno + '</p><pre>' + (e.error ? e.error.stack : '') + '</pre></div>';
});
"@ + "`n"

foreach ($file in $files) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        $content = $content -replace '(?m)^import\s+.*$(?:\r?\n)?', ''
        $content = $content -replace '(?m)^export\s+default\s+', ''
        $content = $content -replace '(?m)^export\s+function\s+', 'function '
        $content = $content -replace '(?m)^export\s+const\s+', 'const '
        $content = $content -replace '(?m)^export\s+let\s+', 'let '
        $content = $content -replace '(?m)^export\s+\{.*\}\s*;?(?:\r?\n)?', ''
        $bundle += "// --- $file ---`n" + $content + "`n`n"
    }
    else {
        Write-Host "Warning: $file not found!"
    }
}
Set-Content -Path "js\bundle.js" -Value $bundle
Write-Host "Bundle created successfully."
