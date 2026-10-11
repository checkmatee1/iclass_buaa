import fs from 'fs';
import path from 'path';
import { startApiServer } from './routes/api';
import { createAutoSignService } from './services/autoSignService';
import logger from './utils/logger';

const loadEnvFile = (filePath: string): void => {
    if (!fs.existsSync(filePath)) {
        return;
    }

    const contents = fs.readFileSync(filePath, 'utf8');
    for (const line of contents.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }

        const separator = trimmed.indexOf('=');
        if (separator <= 0) {
            continue;
        }

        const key = trimmed.slice(0, separator).trim();
        let value = trimmed.slice(separator + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        if (!process.env[key]) {
            process.env[key] = value;
        }
    }
};

loadEnvFile(path.resolve(process.cwd(), '../.env'));
loadEnvFile(path.resolve(process.cwd(), '.env'));

const port = Number(process.env.API_PORT ?? 3000);
const autoSignService = createAutoSignService();
autoSignService.start();

const server = startApiServer(port, {
    getAutoSignStatus: () => autoSignService.getStatus()
});

const shutdown = (signal: string): void => {
    logger.info(`[main] received ${signal}, shutting down`);
    autoSignService.stop();
    server.close(() => process.exit(0));
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
