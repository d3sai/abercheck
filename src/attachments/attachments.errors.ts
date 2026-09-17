export class AttachmentNotFoundError extends Error {
  constructor(readonly id: number) {
    super(`Attachment ${id} not found`);
    this.name = 'AttachmentNotFoundError';
  }
}

export class UnsupportedFileTypeError extends Error {
  constructor(readonly mimeType: string) {
    super(`Unsupported file type: ${mimeType}`);
    this.name = 'UnsupportedFileTypeError';
  }
}
