const fs = require('fs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

async function testFelineSections() {
  const pdfBytes = fs.readFileSync('./public/feline_chart.pdf');
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const firstPage = pdfDoc.getPages()[0];

  const CELL_WIDTH = 27;
  const CELL_HEIGHT = 11;

  // Test the 6 feline sections
  const sections = [
    {
      name: 'Upper Right (109-101)',
      startX: 540,
      startY: 250,
      count: 8,
      xSpacing: -CELL_WIDTH,
      color: rgb(1, 0, 0), // Red
      marker: 'U'
    },
    {
      name: 'Lower Right LEFT (409,408,407)',
      startX: 540,
      startY: 125,
      count: 3,
      xSpacing: -CELL_WIDTH,
      color: rgb(0, 0, 1), // Blue
      marker: 'L'
    },
    {
      name: 'Lower Right MIDDLE (404,403,402,401)',
      startX: 540, // This needs to be adjusted
      startY: 125,
      count: 4,
      xSpacing: -CELL_WIDTH,
      color: rgb(0, 1, 0), // Green
      marker: 'M'
    },
    {
      name: 'Upper Left (201-209)',
      startX: 560,
      startY: 250,
      count: 8,
      xSpacing: CELL_WIDTH,
      color: rgb(1, 0.5, 0), // Orange
      marker: 'U'
    },
    {
      name: 'Lower Left MIDDLE (301,302,303,304)',
      startX: 450, // This needs to be adjusted
      startY: 125,
      count: 4,
      xSpacing: CELL_WIDTH,
      color: rgb(0.5, 0, 0.5), // Purple
      marker: 'M'
    },
    {
      name: 'Lower Left RIGHT (307,308,309)',
      startX: 560,
      startY: 125,
      count: 3,
      xSpacing: CELL_WIDTH,
      color: rgb(0, 0.5, 0.5), // Cyan
      marker: 'R'
    },
  ];

  console.log('Drawing test markers for each section:\n');

  sections.forEach(section => {
    console.log(`${section.name}: startX=${section.startX}, count=${section.count}`);

    for (let i = 0; i < section.count; i++) {
      const x = section.startX + (section.xSpacing * i);
      const y = section.startY;

      firstPage.drawText(section.marker, {
        x: x,
        y: y,
        size: 9,
        font: helveticaFont,
        color: section.color
      });
    }
  });

  // Add legend
  let legendY = 50;
  firstPage.drawText('U=Upper, L=Lower Left section, M=Middle section, R=Right section', {
    x: 50,
    y: legendY,
    size: 8,
    font: helveticaFont,
    color: rgb(0, 0, 0)
  });
  legendY -= 12;
  firstPage.drawText('Red=Upper Right, Blue=Lower Right Left, Green=Lower Right Middle', {
    x: 50,
    y: legendY,
    size: 8,
    font: helveticaFont,
    color: rgb(0, 0, 0)
  });
  legendY -= 12;
  firstPage.drawText('Orange=Upper Left, Purple=Lower Left Middle, Cyan=Lower Left Right', {
    x: 50,
    y: legendY,
    size: 8,
    font: helveticaFont,
    color: rgb(0, 0, 0)
  });

  const pdfBytesOut = await pdfDoc.save();
  fs.writeFileSync('feline-sections-test.pdf', pdfBytesOut);
  console.log('\nTest PDF created: feline-sections-test.pdf');
  console.log('Check if markers align with table cells and if gaps are in the right places.');
}

testFelineSections().catch(console.error);
