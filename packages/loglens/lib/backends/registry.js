import { createElasticBackend } from './elastic.js';
import { createLokiBackend } from './loki.js';
const LOKI_BACKEND = createLokiBackend();
const ELASTIC_BACKEND = createElasticBackend({ flavor: 'es' });
const OPENSEARCH_BACKEND = createElasticBackend({ flavor: 'os' });
export function backendFor(kind) {
    if (kind === 'loki')
        return LOKI_BACKEND;
    if (kind === 'elasticsearch')
        return ELASTIC_BACKEND;
    if (kind === 'opensearch')
        return OPENSEARCH_BACKEND;
    return undefined;
}
//# sourceMappingURL=registry.js.map