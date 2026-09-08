Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$form.StartPosition = "CenterScreen"
$form.Width = 1
$form.Height = 1
$form.Show()
$form.Activate()

$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Filter = "Outlook Veri Dosyaları (*.pst;*.ost)|*.pst;*.ost|Tüm Dosyalar (*.*)|*.*"
$dialog.Title = "Açmak İstediğiniz PST veya OST Dosyasını Seçin"
$dialog.InitialDirectory = [Environment]::GetFolderPath("Desktop")
$dialog.RestoreDirectory = $true
$dialog.Multiselect = $false

$result = $dialog.ShowDialog($form)
$form.Close()
$form.Dispose()

if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    [Console]::WriteLine($dialog.FileName)
}
