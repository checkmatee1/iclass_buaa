"""Private, stateless captcha OCR worker. No request/image/result logging."""
import base64
import binascii
import json
from io import BytesIO
from PIL import Image
from http.server import BaseHTTPRequestHandler, HTTPServer

import ddddocr

MAX_BODY = 750_000
ocr = ddddocr.DdddOcr(show_ad=False)
ocr.set_ranges('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ')


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def log_message(self, *_args):
        pass

    def reply(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.reply(200 if self.path == '/health' else 404, {'ok': self.path == '/health'})

    def do_POST(self):
        if self.path != '/ocr':
            self.reply(404, {'error': 'not_found'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= MAX_BODY:
                self.reply(413, {'error': 'invalid_size'})
                return
            payload = json.loads(self.rfile.read(length))
            image = payload.get('image', '')
            if not isinstance(image, str) or not image.startswith('data:image/'):
                raise ValueError('invalid_image')
            raw = base64.b64decode(image.split(';base64,', 1)[1], validate=True)
            if not 0 < len(raw) <= 512 * 1024:
                raise ValueError('invalid_image')
        except (ValueError, TypeError, AttributeError, IndexError, binascii.Error):
            self.reply(400, {'error': 'invalid_image'})
            return
        try:
            with Image.open(BytesIO(raw)) as image:
                if max(image.size) > 2048:
                    raise ValueError('invalid_dimensions')
            text = ocr.classification(raw)
        except Exception:
            self.reply(422, {'error': 'recognition_failed'})
            return
        self.reply(200, {'text': text})


if __name__ == '__main__':
    HTTPServer(('0.0.0.0', 8000), Handler).serve_forever()
