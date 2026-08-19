$files = @(
    "js\supabaseClient.js",
    # Before store.js, which converts imported foreign sales at read time, and
    # before importedSales.js and both screens that render a rate. It imports
    # nothing itself, so it is safe this early.
    "js\currency.js",
    # Before store.js, which calls getImportedSalesCache() at read time, and
    # before both processor files, which call fetchConnectionRow() and share its
    # session handling. This is the one source for sales imported from anywhere.
    "js\importedSales.js",
    "js\store.js",
    "js\stripeImport.js",
    # The second processor (Pro item 10). Same shape as stripeImport.js and, like
    # it, holds no read of the sales table.
    "js\paypalImport.js",
    "js\aiService.js",
    "js\components\proGate.js",
    # After proGate, because canUseLiveAI() calls isProUser(). Both are hoisted
    # function declarations so the order is not strictly load-bearing, but
    # stripeImport.js already relies on that accident once and once is enough.
    "js\liveAI.js",
    "js\components\nav.js",
    "js\components\tooltip.js",
    "js\components\toast.js",
    # After toast.js and proGate.js, whose showToast() and anyProFeatureLive()
    # it calls. Before account.js and billing.js, the two screens that open the
    # Stripe customer portal through it.
    "js\stripePortal.js",
    "js\components\chatWidget.js",
    # After toast.js and aiService.js, both of which it calls at click time.
    "js\components\weekRegen.js",
    # After store.js, toast.js and proGate.js, which it reads at click time, and
    # before revenue.js, which imports its modal.
    "js\components\pdfReport.js",
    "js\screens\welcome.js",
    "js\screens\wizard.js",
    "js\screens\dashboard.js",
    "js\screens\weeklyPlanner.js",
    "js\screens\revenue.js",
    "js\screens\pipeline.js",
    "js\screens\fridayReview.js",
    "js\screens\progress.js",
    "js\screens\history.js",
    "js\screens\settings.js",
    "js\screens\account.js",
    "js\screens\quarterReset.js",
    "js\screens\coach.js",
    "js\screens\monthlyReview.js",
    "js\screens\mondayPlan.js",
    "js\screens\auth.js",
    "js\screens\roadmap.js",
    "js\screens\billing.js",
    "js\app.js"
)

# No error handler is injected here. index.html registers the single global
# handler: it logs the detail to the console and shows the customer a calm
# recovery message. A second handler prepending a red stack trace to the page
# would undo that, which is exactly what this block used to do.
$bundle = ""

# The AI coach is handed the user guide as ground truth about how the app works.
# It used to be a second copy pasted into aiService.js, which drifted from the
# real USER_GUIDE.md and had the coach explaining features that did not exist.
# Generating it here means there is only one copy to keep honest.
$guidePath = "USER_GUIDE.md"
if (Test-Path $guidePath) {
    $guide = Get-Content $guidePath -Raw
    # Neutralise the three sequences that would break out of a JS template
    # literal. Backslash must be escaped first or it re-escapes the others.
    $bt = [string][char]96
    $guide = $guide.Replace('\', '\\').Replace($bt, '\' + $bt).Replace('$', '\$')
    $bundle += "// --- Generated from USER_GUIDE.md at build time. Edit that file, not this. ---`n"
    $bundle += "const CEO_USER_GUIDE = " + $bt + $guide + $bt + ";`n`n"
}
else {
    Write-Host "Warning: $guidePath not found. The AI coach will fall back to its short built-in summary."
}

foreach ($file in $files) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        $content = $content -replace '(?m)^import\s+.*$(?:\r?\n)?', ''
        $content = $content -replace '(?m)^export\s+default\s+', ''
        $content = $content -replace '(?m)^export\s+function\s+', 'function '
        $content = $content -replace '(?m)^export\s+async\s+function\s+', 'async function '
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
