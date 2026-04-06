import Foundation
import PDFKit

if CommandLine.arguments.count < 4 {
  fputs("usage: extract_pdf_text.swift <pdf-path> <start-page-index> <end-page-index>\n", stderr)
  exit(1)
}

let pdfPath = CommandLine.arguments[1]
guard let start = Int(CommandLine.arguments[2]), let end = Int(CommandLine.arguments[3]) else {
  fputs("start and end page indexes must be integers\n", stderr)
  exit(1)
}

guard let document = PDFDocument(url: URL(fileURLWithPath: pdfPath)) else {
  fputs("failed to open PDF: \(pdfPath)\n", stderr)
  exit(1)
}

if start < 0 || end < start || end >= document.pageCount {
  fputs("page range out of bounds for PDF with \(document.pageCount) pages\n", stderr)
  exit(1)
}

for pageIndex in start...end {
  guard let page = document.page(at: pageIndex) else { continue }
  let text = page.string ?? ""
  print("===== PAGE \(pageIndex + 1) =====")
  print(text)
}
