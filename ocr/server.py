"""Private, stateless captcha OCR worker. No request/image/result logging."""
import base64
import binascii
import json
from io import BytesIO
from PIL import Image, ImageOps
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
            attempt = payload.get('attempt', 0)
            if type(attempt) is not int or not 0 <= attempt < 5:
                raise ValueError('invalid_attempt')
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
                if attempt == 0:
                    prepared = image.copy()
                else:
                    rgba = image.convert('RGBA')
                    prepared = Image.new('RGBA', rgba.size, 'white')
                    prepared.alpha_composite(rgba)
                    prepared = prepared.convert('RGB')
                    if attempt == 1:
                        prepared = prepared.resize((prepared.width * 2, prepared.height * 2), Image.Resampling.LANCZOS)
                    else:
                        prepared = ImageOps.autocontrast(prepared.convert('L'))
                        if attempt >= 3:
                            threshold = 128 if attempt == 3 else 180
                            prepared = prepared.point(lambda value: 255 if value >= threshold else 0)
                text = ocr.classification(prepared)
        except Exception:
            self.reply(422, {'error': 'recognition_failed'})
            return
        self.reply(200, {'text': text})


if __name__ == '__main__':
    HTTPServer(('0.0.0.0', 8000), Handler).serve_forever()
