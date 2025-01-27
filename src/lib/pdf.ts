import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

// Configure worker to use local file
GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

export async function extractTextFromPDF(pdfBuffer: ArrayBuffer): Promise<string> {
  try {
    const pdf = await getDocument({ data: pdfBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .filter((item: any) => typeof item.str === 'string')
        .map((item: any) => item.str.trim())
        .join(' ');
      fullText += pageText + ' ';
    }

    return fullText.trim().replace(/\s+/g, ' ');
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw error;
  }
}