const fs = require('fs');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

async function testDentalGrid() {
  const pdfBytes = fs.readFileSync('./public/feline_chart.pdf');
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const firstPage = pdfDoc.getPages()[0];
  const { width, height } = firstPage.getSize();

  console.log(`Page: ${width} x ${height}\n`);

  // Test the upper table first
  // Based on screenshot, the table appears to be in the upper portion
  // Let's test different starting positions and spacing

  const testConfigs = [
    { label: 'Test A', startX: 160, startY: 485, xSpacing: 43, ySpacing: 17 },
    { label: 'Test B', startX: 170, startY: 485, xSpacing: 43, ySpacing: 17 },
    { label: 'Test C', startX: 165, startY: 485, xSpacing: 43, ySpacing: 17 },
  ];

  testConfigs.forEach(config => {
    console.log(`${config.label}: startX=${config.startX}, startY=${config.startY}, xSpacing=${config.xSpacing}, ySpacing=${config.ySpacing}`);

    // Draw test numbers for first 8 teeth in upper right quadrant (M1=109, P4=108, P3=107, P2=106, C=104, I3=103, I2=102, I1=101)
    // This is mobility row
    for (let i = 0; i < 8; i++) {
      const x = config.startX + (i * config.xSpacing);
      const y = config.startY;

      firstPage.drawText('X', {
        x: x,
        y: y,
        size: 9,
        font: helveticaFont,
        color: rgb(1, 0, 0)
      });
    }
  });

  // Add reference labels
  firstPage.drawText('Red X = Test markers for tooth positions', {
    x: 50,
    y: 50,
    size: 10,
    font: helveticaFont,
    color: rgb(1, 0, 0)
  });

  const pdfBytesOut = await pdfDoc.save();
  fs.writeFileSync('dental-grid-test.pdf', pdfBytesOut);
  console.log('\nTest PDF created: dental-grid-test.pdf');
  console.log('Open it to see which configuration aligns best with the Mobility row.');
}

testDentalGrid().catch(console.error);
