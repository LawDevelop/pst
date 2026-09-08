Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$form.StartPosition = "CenterScreen"
$form.Width = 1
$form.Height = 1
$form.Show()
$form.Activate()

$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Dışa Aktarılacak Hedef Klasörü Seçin"
$dialog.ShowNewFolderButton = $true

$result = $dialog.ShowDialog($form)
$form.Close()
$form.Dispose()

if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    [Console]::WriteLine($dialog.SelectedPath)
}
