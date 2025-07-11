const { PDFtotextServer } = require('../src/server');

describe('PDFtotextServer', () => {
  let server;

  beforeEach(() => {
    server = new PDFtotextServer();
  });

  test('should create server instance', () => {
    expect(server).toBeInstanceOf(PDFtotextServer);
  });

  test('should check if pdftotext is available', () => {
    const isAvailable = server.checkPdftotextAvailable();
    // This test will depend on whether pdftotext is installed
    expect(typeof isAvailable).toBe('boolean');
  });

});
