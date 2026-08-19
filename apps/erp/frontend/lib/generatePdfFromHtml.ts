import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface PdfOptions {
  filename: string;
  width: number;
  height: number;
  orientation?: "p" | "l";
  format?: string | [number, number];
  margin?: number | number[];
}

export async function generatePdfFromHtml(
  htmlContent: string,
  options: PdfOptions
): Promise<void> {
  const container = document.createElement("div");
  container.innerHTML = htmlContent;
  container.style.position = "fixed";
  container.style.top = "0";
  container.style.left = "0";
  container.style.width = `${options.width}mm`;
  container.style.zIndex = "-1000";
  container.style.opacity = "0";
  container.style.pointerEvents = "none";
  document.body.appendChild(container);

  await document.fonts.ready;
  await new Promise((r) => setTimeout(r, 500));

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF(
      options.orientation || "l",
      "mm",
      options.format || [options.width, options.height]
    );
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
    pdf.save(options.filename);
  } finally {
    document.body.removeChild(container);
  }
}
