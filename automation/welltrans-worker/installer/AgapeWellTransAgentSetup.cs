using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[assembly: AssemblyTitle("Agape Care WellTrans Agent Setup")]
[assembly: AssemblyDescription("Secure Agape Care WellTrans automation agent installer")]
[assembly: AssemblyCompany("Agape Care Medical Transportation")]
[assembly: AssemblyProduct("Agape Care WellTrans Agent")]
[assembly: AssemblyVersion("3.8.1.0")]
[assembly: AssemblyFileVersion("3.8.1.0")]

namespace AgapeCare.WellTrans
{
    internal sealed class ReleaseManifest
    {
        public string version { get; set; }
        public string file { get; set; }
        public string sha256 { get; set; }
    }

    internal sealed class SetupWindow : Form
    {
        private readonly Label statusLabel;
        private readonly ProgressBar progressBar;
        private readonly BackgroundWorker worker;
        private bool installationFinished;

        public SetupWindow()
        {
            Text = "Agape Care WellTrans Agent";
            ClientSize = new Size(500, 188);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.White;
            Font = new Font("Segoe UI", 9F);

            var title = new Label {
                Text = "Installing the Agape WellTrans Agent",
                Font = new Font("Segoe UI Semibold", 15F),
                ForeColor = Color.FromArgb(15, 23, 42),
                AutoSize = true,
                Location = new Point(28, 25)
            };
            var subtitle = new Label {
                Text = "Secure local automation for the WellTrans broker portal",
                ForeColor = Color.FromArgb(100, 116, 139),
                AutoSize = true,
                Location = new Point(30, 60)
            };
            statusLabel = new Label {
                Text = "Verifying the enterprise agent package…",
                ForeColor = Color.FromArgb(30, 64, 175),
                AutoSize = false,
                Size = new Size(440, 38),
                Location = new Point(30, 96)
            };
            progressBar = new ProgressBar {
                Style = ProgressBarStyle.Marquee,
                MarqueeAnimationSpeed = 24,
                Size = new Size(440, 8),
                Location = new Point(30, 145)
            };
            Controls.Add(title);
            Controls.Add(subtitle);
            Controls.Add(statusLabel);
            Controls.Add(progressBar);

            worker = new BackgroundWorker();
            worker.DoWork += InstallAgent;
            worker.RunWorkerCompleted += InstallationFinished;
            Shown += delegate { worker.RunWorkerAsync(); };
            FormClosing += delegate(object sender, FormClosingEventArgs args) {
                if (!installationFinished) args.Cancel = true;
            };
        }

        private void SetStatus(string value)
        {
            if (InvokeRequired) {
                BeginInvoke(new Action<string>(SetStatus), value);
                return;
            }
            statusLabel.Text = value;
        }

        private static string Sha256(byte[] bytes)
        {
            using (var algorithm = SHA256.Create()) {
                var hash = algorithm.ComputeHash(bytes);
                var builder = new StringBuilder(hash.Length * 2);
                foreach (var item in hash) builder.Append(item.ToString("x2"));
                return builder.ToString();
            }
        }

        private void InstallAgent(object sender, DoWorkEventArgs args)
        {
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            const string releaseRoot = "https://agape5.web.app/welltrans-agent";
            var setupRoot = Path.Combine(
                Path.GetTempPath(),
                "AgapeWellTransAgentSetup-" + Guid.NewGuid().ToString("N")
            );
            Directory.CreateDirectory(setupRoot);
            try {
                SetStatus("Downloading the verified Agent 2.0 release…");
                ReleaseManifest manifest;
                byte[] archive;
                using (var client = new WebClient()) {
                    client.Headers.Add(HttpRequestHeader.UserAgent, "Agape-WellTrans-Agent-Setup/2.2");
                    var manifestText = client.DownloadString(releaseRoot + "/version.json");
                    manifest = new JavaScriptSerializer().Deserialize<ReleaseManifest>(manifestText);
                    if (manifest == null || String.IsNullOrWhiteSpace(manifest.file)
                        || String.IsNullOrWhiteSpace(manifest.sha256)) {
                        throw new InvalidOperationException("The Agape release manifest is incomplete.");
                    }
                    archive = client.DownloadData(releaseRoot + "/" + manifest.file);
                }
                if (!String.Equals(Sha256(archive), manifest.sha256, StringComparison.OrdinalIgnoreCase)) {
                    throw new InvalidOperationException("The downloaded agent failed SHA-256 verification.");
                }

                SetStatus("Installing the private runtime, encrypted session, and browser…");
                var archivePath = Path.Combine(setupRoot, "agent.zip");
                File.WriteAllBytes(archivePath, archive);
                ZipFile.ExtractToDirectory(archivePath, setupRoot);
                var installerPath = Path.Combine(
                    setupRoot,
                    "agape-welltrans-agent",
                    "launcher",
                    "Install-AgapeWellTransAgent.ps1"
                );
                if (!File.Exists(installerPath)) {
                    throw new InvalidOperationException("The verified package does not contain the agent installer.");
                }

                var startInfo = new ProcessStartInfo {
                    FileName = "powershell.exe",
                    Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \""
                        + installerPath.Replace("\"", "\"\"") + "\"",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                using (var process = Process.Start(startInfo)) {
                    if (process == null) throw new InvalidOperationException("Windows could not start the installer.");
                    process.WaitForExit();
                    if (process.ExitCode != 0) {
                        throw new InvalidOperationException(
                            "Installation stopped with code " + process.ExitCode
                            + ". Details are in AgapeSecrets\\welltrans-agent-install.log."
                        );
                    }
                }
                args.Result = manifest.version;
            }
            finally {
                try {
                    if (Directory.Exists(setupRoot)) Directory.Delete(setupRoot, true);
                }
                catch { }
            }
        }

        private void InstallationFinished(object sender, RunWorkerCompletedEventArgs args)
        {
            installationFinished = true;
            progressBar.Style = ProgressBarStyle.Continuous;
            progressBar.Value = args.Error == null ? 100 : 0;
            if (args.Error != null) {
                statusLabel.ForeColor = Color.FromArgb(185, 28, 28);
                statusLabel.Text = "Installation could not be completed.";
                MessageBox.Show(
                    this,
                    args.Error.Message,
                    "Agape WellTrans Agent",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            } else {
                statusLabel.ForeColor = Color.FromArgb(4, 120, 87);
                statusLabel.Text = "Agent " + Convert.ToString(args.Result) + " is installed and ready.";
                MessageBox.Show(
                    this,
                    "Installation is complete. Return to Agape and click Start & Fill Selected Date.",
                    "Agape WellTrans Agent",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
            }
            Close();
        }
    }

    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            if (args != null && args.Length == 1
                && String.Equals(args[0], "--self-test", StringComparison.OrdinalIgnoreCase)) {
                return;
            }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupWindow());
        }
    }
}
