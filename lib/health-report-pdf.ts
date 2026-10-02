import { reportLines, type HealthReport } from "@/lib/health-report";

// Loaded only on demand. No report data leaves the browser.
export async function createHealthReportPdf(report: HealthReport): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not prepare the PDF. Use the text report instead.");
  const width = 507;
  const fontSize = 11;
  context.font = `${fontSize}px sans-serif`;
  let y = 95;
  let page = 1;
  const heading = () => {
    pdf.setFillColor(15, 118, 110); pdf.rect(0, 0, 595.28, 58, "F");
    pdf.setTextColor(255, 255, 255); pdf.setFontSize(17); pdf.text("Health Monitor | Personal report", 44, 36);
    pdf.setFontSize(9); pdf.setTextColor(80, 95, 95);
    pdf.text(`${report.options.start} to ${report.options.end}`, 44, 77);
    pdf.text(`Page ${page}`, 500, 815); pdf.setFontSize(fontSize); pdf.setTextColor(25, 45, 45);
  };
  heading();
  const write = (line: string) => {
    if (y > 780) { pdf.addPage(); page++; y = 103; heading(); }
    if (/[^\x20-\x7e]/.test(line)) {
      // Browser fonts preserve names/scripts that PDF's built-in Latin fonts cannot render.
      canvas.width = Math.ceil(width * 3); canvas.height = 60;
      context.font = `${fontSize * 3}px sans-serif`; context.fillStyle = "#192d2d";
      context.fillText(line, 0, 42);
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 44, y - 14, width, 20);
      context.font = `${fontSize}px sans-serif`;
    } else pdf.text(line, 44, y);
    y += 17;
  };
  for (const paragraph of reportLines(report)) {
    if (!paragraph) { write(""); continue; }
    // Measure with system fonts, keeping Unicode graphemes together on wrapped lines.
    const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(paragraph);
    let line = "";
    for (const { segment } of segments) {
      if (line && context.measureText(line + segment).width > width - 8) { write(line); line = ""; }
      line += segment;
    }
    if (line) write(line);
  }
  pdf.setProperties({ title: "Personal health report", author: "Health Monitor", subject: "Self-recorded health history" });
  return pdf.output("blob");
}
