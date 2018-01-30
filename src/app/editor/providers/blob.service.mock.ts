import { Injectable } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

@Injectable()
export class MockBlobService {
    constructor( private sanitizer: DomSanitizer ) { }

    reateObjectURL(file: File): SafeUrl {
        return this.sanitizer.bypassSecurityTrustUrl('data:image/png;base64,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');
    }
}
