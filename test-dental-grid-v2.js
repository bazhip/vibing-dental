const fs = require('fs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

async function testDentalGrid() {
  const pdfBytes = fs.readFileSync('./public/feline_chart.pdf');
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const firstPage = pdfDoc.getPages()[0];

  // Based on visual inspection of the PDF:
  // Upper table starts around x=310, Mobility row around y=485
  // Each column is approximately 40-43 pixels wide
  // Each row is approximately 16-17 pixels tall

  const testConfigs = [
    { label: 'Config 1', startX: 310, startY: 485, xSpacing: 42, ySpacing: 17, color: rgb(1, 0, 0) },  // Red
    { label: 'Config 2', startX: 320, startY: 490, xSpacing: 42, ySpacing: 17, color: rgb(0, 0, 1) },  // Blue
    { label: 'Config 3', startX: 325, startY: 487, xSpacing: 41.5, ySpacing: 17, color: rgb(0, 0.5, 0) },  // Green
  ];

  testConfigs.forEach(config => {
    console.log(`${config.label}: startX=${config.startX}, startY=${config.startY}, xSpacing=${config.xSpacing}, ySpacing=${config.ySpacing}`);

    // Draw markers for first 8 teeth columns (M1, P4, P3, P2, C, I3, I2, I1)
    for (let i = 0; i < 8; i++) {
      const x = config.startX + (i * config.xSpacing);
      const y = config.startY;

      firstPage.drawText('T', {
        x: x,
        y: y,
        size: 9,
        font: helveticaFont,
        color: config.color
      });
    }

    // Also test lower table
    // Lower table appears to be at around y=305
    const lowerY = 305;
    for (let i = 0; i < 3; i++) {
      const x = config.startX + (i * config.xSpacing);
      firstPage.drawText('B', {
        x: x,
        y: lowerY,
        size: 9,
        font: helveticaFont,
        color: config.color
      });
    }
  });

  // Add legend
  firstPage.drawText('Red=Config1, Blue=Config2, Green=Config3', {
    x: 50,
    y: 50,
    size: 10,
    font: helveticaFont,
    color: rgb(0, 0, 0)
  });
  firstPage.drawText('T=Upper table test, B=Lower table test', {
    x: 50,
    y: 35,
    size: 10,
    font: helveticaFont,
    color: rgb(0, 0, 0)
  });

  const pdfBytesOut = await pdfDoc.save();
  fs.writeFileSync('dental-grid-test-v2.pdf', pdfBytesOut);
  console.log('\nTest PDF created: dental-grid-test-v2.pdf');
  console.log('Check which colored markers align best with the grid cells.');
}

testDentalGrid().catch(console.error);
