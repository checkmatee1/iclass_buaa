// Only the captcha image is sent to the local OCR worker, never login credentials.
export const recognizeCaptcha = async (image: string, attempt = 0): Promise<string | null> => {
    const endpoint = String(process.env.ICLASS_CAPTCHA_OCR_URL ?? '').trim();
    // Never allow a webpage-facing service to use OCR as a bridge to the host or Hermes.
    if (endpoint !== 'http://captcha-ocr:8000/ocr') return null;
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            redirect: 'error',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({image, attempt}),
            signal: AbortSignal.timeout(10_000)
        });
        if (!response.ok) return null;
        const result = await response.json() as {text?: unknown};
        if (typeof result.text !== 'string') return null;
        const text = result.text.replace(/\s/g, '').toLowerCase();
        return /^[a-z0-9]{3,8}$/.test(text) ? text : null;
    } catch {
        return null;
    }
};
