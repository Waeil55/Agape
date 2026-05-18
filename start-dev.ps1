cd "C:\Users\waeil\Desktop\Agape Care\App5"
npx.cmd vite --port 3000 --host 2>&1 | Out-File -FilePath "$env:TEMP\vite-output.txt" -Append
