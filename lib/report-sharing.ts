export function downloadReportFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function shareReportFile(file: File, device: Pick<Navigator, "canShare" | "share"> = navigator) {
  if (!device.share || !device.canShare) return "unsupported";
  try { if (!device.canShare({ files: [file] })) return "unsupported"; } catch { return "unsupported"; }
  try {
    // File is prepared before this click to retain the browser's user activation.
    await device.share({ title: "My health report", files: [file] });
    return "shared";
  } catch (error) {
    if (error && typeof error === "object" && "name" in error && error.name === "AbortError") return "cancelled";
    throw new Error("Sharing did not complete. Download the report and attach it to your message instead.");
  }
}
